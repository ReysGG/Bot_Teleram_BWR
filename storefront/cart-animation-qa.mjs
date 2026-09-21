const endpoint = process.argv[2] ?? "http://127.0.0.1:9333";
const targets = await fetch(`${endpoint}/json/list`).then((response) => response.json());
const page = targets.find((target) => target.type === "page" && target.url.includes("/shop"));
if (!page) throw new Error("Shop page target was not found");

const socket = new WebSocket(page.webSocketDebuggerUrl);
const pending = new Map();
const runtimeEvents = [];
let commandId = 0;

socket.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  if (!message.id) {
    if (message.method === "Runtime.exceptionThrown") {
      runtimeEvents.push(message.params.exceptionDetails.text);
    }
    if (message.method === "Log.entryAdded" && message.params.entry.level === "error") {
      runtimeEvents.push(message.params.entry.text);
    }
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

await send("Runtime.enable");
await send("Log.enable");
await send("Page.enable");
await send("Page.reload", { ignoreCache: true });
const evaluation = await send("Runtime.evaluate", {
  awaitPromise: true,
  returnByValue: true,
  expression: `
    (async () => {
      const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
      for (let attempt = 0; attempt < 80; attempt += 1) {
        if (document.querySelector('.add-cart-button:not(:disabled)') && document.querySelector('[data-cart-animation-target]')) break;
        await wait(100);
      }

      await wait(4000);
      const button = document.querySelector('.add-cart-button:not(:disabled)');
      const cart = document.querySelector('[data-cart-animation-target]');
      if (!(button instanceof HTMLElement) || !(cart instanceof HTMLElement)) {
        return { ok: false, reason: 'required-elements-missing' };
      }

      button.scrollIntoView({ block: 'center', behavior: 'instant' });
      await wait(150);
      const source = button.closest('.product-card, .product-detail')?.querySelector('.product-artwork') ?? button;
      const sourceRect = source.getBoundingClientRect();
      const cartRect = cart.getBoundingClientRect();
      const beforeCount = Number(cart.querySelector('b')?.textContent ?? 0);
      const reactHandlerAttached = Object.keys(button).some((key) => key.startsWith('__reactProps'));

      button.click();
      await wait(90);
      const flying = document.querySelector('.cart-flying-item');
      const flyingRect = flying?.getBoundingClientRect();
      const flightStarted = Boolean(flying);
      const startsNearSource = Boolean(flyingRect)
        && Math.abs((flyingRect.left + flyingRect.width / 2) - (sourceRect.left + sourceRect.width / 2)) < 70
        && Math.abs((flyingRect.top + flyingRect.height / 2) - (sourceRect.top + sourceRect.height / 2)) < 70;

      await wait(390);
      const pulseActive = cart.classList.contains('is-cart-receiving');
      const pulseBackground = getComputedStyle(cart).backgroundColor;
      const activeCartAnimations = cart.getAnimations().length;

      await wait(430);
      const afterCount = Number(cart.querySelector('b')?.textContent ?? 0);
      const flightCleanedUp = !document.querySelector('.cart-flying-item');
      const pulseCleanedUp = !cart.classList.contains('is-cart-receiving');

      return {
        ok: true,
        beforeCount,
        afterCount,
        reactHandlerAttached,
        flightStarted,
        startsNearSource,
        pulseActive,
        pulseBackground,
        activeCartAnimations,
        flightCleanedUp,
        pulseCleanedUp,
        cartTargetVisible: cartRect.width > 0 && cartRect.height > 0,
      };
    })()
  `,
});

console.log(JSON.stringify(evaluation.result.value, null, 2));
if (runtimeEvents.length > 0) console.log(JSON.stringify({ runtimeEvents }, null, 2));
socket.close();
