const endpoint = process.argv[2] ?? "http://127.0.0.1:9333";
const pagePath = process.argv[3] ?? "/shop";
const expectedUrl = new URL(pagePath, "http://127.0.0.1:3001").href;
const targets = await fetch(`${endpoint}/json/list`).then((response) => response.json());
const page = targets.find((target) => target.type === "page" && target.url === expectedUrl);
if (!page) throw new Error(`Page target was not found for ${expectedUrl}`);

const socket = new WebSocket(page.webSocketDebuggerUrl);
const pending = new Map();
const runtimeEvents = [];
let commandId = 0;

socket.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  if (!message.id) {
    if (message.method === "Runtime.exceptionThrown") runtimeEvents.push(message.params.exceptionDetails.text);
    if (message.method === "Log.entryAdded" && message.params.entry.level === "error") runtimeEvents.push(message.params.entry.text);
    return;
  }
  const handlers = pending.get(message.id);
  if (!handlers) return;
  pending.delete(message.id);
  if (message.error) handlers.reject(new Error(message.error.message));
  else handlers.resolve(message.result);
});

await new Promise((resolve, reject) => {
  socket.addEventListener("open", resolve, { once: true });
  socket.addEventListener("error", reject, { once: true });
});

function send(method, params = {}) {
  const id = ++commandId;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const evaluate = async (expression) => {
  const result = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  return result.result.value;
};

await send("Runtime.enable");
await send("Log.enable");
await send("Page.enable");
await send("Emulation.setDeviceMetricsOverride", {
  width: 1440,
  height: 1000,
  deviceScaleFactor: 1,
  mobile: false,
});
await send("Page.reload", { ignoreCache: true });
await wait(5000);

const prepared = await evaluate(`
  (async () => {
    const button = document.querySelector('.add-cart-button:not(:disabled)');
    const cart = document.querySelector('[data-cart-animation-target]');
    if (!(button instanceof HTMLElement) || !(cart instanceof HTMLElement)) return { ok: false };
    button.scrollIntoView({ block: 'center', behavior: 'instant' });
    await new Promise((resolve) => setTimeout(resolve, 200));
    const rect = button.getBoundingClientRect();
    return {
      ok: true,
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
      beforeCount: Number(cart.querySelector('b')?.textContent ?? 0),
      reactKeys: Object.keys(button).filter((key) => key.startsWith('__react')).slice(0, 8),
      readyState: document.readyState,
      scripts: Array.from(document.scripts).map((script) => script.src || script.type).slice(-12),
      scriptResources: performance.getEntriesByType('resource')
        .filter((entry) => entry.initiatorType === 'script')
        .map((entry) => ({ name: entry.name, duration: Math.round(entry.duration), size: entry.transferSize }))
        .slice(-12),
    };
  })()
`);
if (!prepared.ok) throw new Error("Required elements were not found");

await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: prepared.x, y: prepared.y });
await send("Input.dispatchMouseEvent", { type: "mousePressed", x: prepared.x, y: prepared.y, button: "left", buttons: 1, clickCount: 1 });
await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: prepared.x, y: prepared.y, button: "left", buttons: 0, clickCount: 1 });

await wait(90);
const early = await evaluate(`({
  flightStarted: Boolean(document.querySelector('.cart-flying-item')),
  currentCount: Number(document.querySelector('[data-cart-animation-target] b')?.textContent ?? 0),
})`);

await wait(390);
const middle = await evaluate(`(() => {
  const cart = document.querySelector('[data-cart-animation-target]');
  return {
    pulseActive: cart?.classList.contains('is-cart-receiving') ?? false,
    pulseBackground: cart ? getComputedStyle(cart).backgroundColor : null,
    activeCartAnimations: cart?.getAnimations().length ?? 0,
  };
})()`);

await wait(430);
const late = await evaluate(`(() => {
  const cart = document.querySelector('[data-cart-animation-target]');
  return {
    afterCount: Number(cart?.querySelector('b')?.textContent ?? 0),
    flightCleanedUp: !document.querySelector('.cart-flying-item'),
    pulseCleanedUp: !(cart?.classList.contains('is-cart-receiving') ?? false),
  };
})()`);

console.log(JSON.stringify({ prepared, early, middle, late, runtimeEvents }, null, 2));
socket.close();
