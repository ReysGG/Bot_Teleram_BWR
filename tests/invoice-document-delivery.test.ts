import { afterEach, expect, it, vi } from "vitest";
import { deliverInvoiceDocument } from "@/server/telegram/invoice-delivery";
import { TelegramApiError } from "@/server/telegram/api";
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
const input = { chatId:"123", invoiceMessageId:42, filename:"synthetic.txt", fileContent:"fixture-only", caption:"Produk contoh" };
function setup(responses: Array<Response | Error>) {
  vi.stubEnv("TELEGRAM_BOT_TOKEN", "synthetic-token");
  const fetchMock=vi.fn();
  for(const response of responses) { if(response instanceof Error) fetchMock.mockRejectedValueOnce(response); else fetchMock.mockResolvedValueOnce(response); }
  vi.stubGlobal("fetch",fetchMock); return fetchMock;
}
it("sends the document at the current chat position and removes the obsolete invoice", async () => {
  const fetchMock=setup([
    Response.json({ok:true,result:{message_id:77}}),
    Response.json({ok:true,result:true}),
  ]);
  expect(await deliverInvoiceDocument(input)).toEqual({message_id:77});
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(fetchMock.mock.calls[0][0]).toMatch(/\/sendDocument$/);
  expect(fetchMock.mock.calls[1][0]).toMatch(/\/deleteMessage$/);
  const documentBody=fetchMock.mock.calls[0][1].body as FormData;
  expect(documentBody.get("document")).toBeTruthy();
  expect(JSON.parse(String(fetchMock.mock.calls[1][1].body))).toMatchObject({
    chat_id: "123",
    message_id: 42,
  });
});
it("does not require invoice cleanup when there is no owned invoice", async () => {
  const fetchMock=setup([Response.json({ok:true,result:{message_id:77}})]);
  expect(await deliverInvoiceDocument({...input,invoiceMessageId:null})).toEqual({message_id:77});
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(fetchMock.mock.calls[0][0]).toMatch(/\/sendDocument$/);
});
it("never deletes the invoice when the upload outcome is unknown", async () => {
  const fetchMock=setup([new Error("network unavailable")]);
  await expect(deliverInvoiceDocument(input)).rejects.toMatchObject({responseReceived:false});
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
it("preserves a retryable Telegram failure without deleting the invoice", async () => {
  const fetchMock=setup([new Response("invalid response",{status:502})]);
  await expect(deliverInvoiceDocument(input)).rejects.toMatchObject({
    responseReceived:true,
    statusCode:502,
  });
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
it("keeps the accepted document successful when obsolete-invoice cleanup fails", async () => {
  const fetchMock=setup([
    Response.json({ok:true,result:{message_id:99}}),
    new Error("cleanup unavailable"),
  ]);
  await expect(deliverInvoiceDocument(input)).resolves.toEqual({message_id:99});
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(fetchMock.mock.calls[0][0]).toMatch(/\/sendDocument$/);
  expect(fetchMock.mock.calls[1][0]).toMatch(/\/deleteMessage$/);
});
it("preserves rate-limit retry policy without deleting the invoice", async () => {
  const fetchMock=setup([Response.json({ok:false,error_code:429,description:"Too Many Requests",parameters:{retry_after:30}},{status:429})]);
  await expect(deliverInvoiceDocument(input)).rejects.toBeInstanceOf(TelegramApiError);
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
