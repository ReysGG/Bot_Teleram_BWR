import { beforeEach, expect, it, vi } from "vitest";
const mocks=vi.hoisted(()=>({payments:vi.fn(),receipt:vi.fn()}));
vi.mock("@/server/db/prisma",()=>({prisma:{payment:{findMany:mocks.payments},sentDelivery:{findFirst:mocks.receipt}}}));
import { invoiceMessageIdForDelivery } from "@/server/telegram/invoice-message-owner";
const order={id:"own",chatId:"123",payment:{telegramInvoiceMessageId:42}};
beforeEach(()=>{vi.clearAllMocks();mocks.payments.mockResolvedValue([{orderId:"own"}]);mocks.receipt.mockResolvedValue(null);});
it("edits only the uniquely mapped owner's invoice",async()=>{
 expect(await invoiceMessageIdForDelivery(order)).toBe(42);
 expect(mocks.payments).toHaveBeenCalledWith(expect.objectContaining({where:{telegramInvoiceMessageId:42,order:{chatId:"123"}},take:2}));
});
it("does not overwrite legacy shared invoice IDs or another order's delivered file",async()=>{
 mocks.payments.mockResolvedValue([{orderId:"own"},{orderId:"another"}]);
 expect(await invoiceMessageIdForDelivery(order)).toBeNull();
 mocks.payments.mockResolvedValue([{orderId:"own"}]);mocks.receipt.mockResolvedValue({id:"another-receipt"});
 expect(await invoiceMessageIdForDelivery(order)).toBeNull();
});
it("falls back for missing and mismatched invoice ownership",async()=>{
 expect(await invoiceMessageIdForDelivery({...order,payment:null})).toBeNull();
 mocks.payments.mockResolvedValue([{orderId:"another"}]);
 expect(await invoiceMessageIdForDelivery(order)).toBeNull();
});
