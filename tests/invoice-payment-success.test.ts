import { beforeEach, expect, it, vi } from "vitest";
const mocks=vi.hoisted(()=>({order:vi.fn(),update:vi.fn(),send:vi.fn(),remove:vi.fn()}));
vi.mock("@/server/db/prisma",()=>({prisma:{order:{findUniqueOrThrow:mocks.order},telegramNotification:{update:mocks.update}}}));
vi.mock("@/server/telegram/api",async original=>({...await original<typeof import("@/server/telegram/api")>(),sendMessage:mocks.send,deleteMessage:mocks.remove}));
import { processPaymentSuccess } from "@/server/telegram/delivery-worker";
beforeEach(()=>{vi.clearAllMocks();mocks.order.mockResolvedValue({id:"o1",chatId:"123",status:"FULFILLING",payment:{telegramInvoiceMessageId:42,status:"PAID"},items:[{}]});mocks.update.mockResolvedValue({});});
it("keeps the invoice ready for replacement without sending a second success message",async()=>{
 const notification={id:"n1",orderId:"o1",chatId:"123"} as Parameters<typeof processPaymentSuccess>[0];
 expect(await processPaymentSuccess(notification)).toBe("sent");
 expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({status:"SENT"})}));
 expect(mocks.send).not.toHaveBeenCalled();expect(mocks.remove).not.toHaveBeenCalled();
});
