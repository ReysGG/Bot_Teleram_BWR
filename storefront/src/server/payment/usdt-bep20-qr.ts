import QRCode from "qrcode";
import { normalizeEvmAddress } from "@/server/payment/usdt-bep20-setting";

export async function createUsdtBep20AddressQr(
  recipientAddress: string,
): Promise<Buffer> {
  const address = normalizeEvmAddress(recipientAddress);
  return QRCode.toBuffer(address, {
    type: "png",
    errorCorrectionLevel: "H",
    margin: 4,
    width: 1024,
    color: {
      dark: "#000000",
      light: "#FFFFFF",
    },
  });
}
