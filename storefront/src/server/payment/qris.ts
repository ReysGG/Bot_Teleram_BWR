import QRCode from "qrcode";

type QrisField = { tag: string; value: string };

function encodeField(field: QrisField): string {
  if (!/^\d{2}$/.test(field.tag) || field.value.length > 99) {
    throw new Error("Invalid QRIS field");
  }
  return `${field.tag}${field.value.length.toString().padStart(2, "0")}${field.value}`;
}

export function parseQrisFields(payload: string): QrisField[] {
  const fields: QrisField[] = [];
  let offset = 0;
  while (offset < payload.length) {
    const tag = payload.slice(offset, offset + 2);
    const lengthText = payload.slice(offset + 2, offset + 4);
    if (!/^\d{2}$/.test(tag) || !/^\d{2}$/.test(lengthText)) {
      throw new Error("QRIS payload contains an invalid TLV header");
    }
    const length = Number(lengthText);
    const valueStart = offset + 4;
    const valueEnd = valueStart + length;
    if (valueEnd > payload.length) {
      throw new Error("QRIS payload contains a truncated TLV value");
    }
    fields.push({ tag, value: payload.slice(valueStart, valueEnd) });
    offset = valueEnd;
  }
  return fields;
}

export function qrisCrc16(value: string): string {
  let crc = 0xffff;
  for (const character of Buffer.from(value, "utf8")) {
    crc ^= character << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      crc =
        (crc & 0x8000) !== 0
          ? ((crc << 1) ^ 0x1021) & 0xffff
          : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

export function normalizeAndValidateStaticQrisPayload(payload: string): string {
  const normalized = payload.trim();
  if (normalized.length < 20 || normalized.length > 4096) {
    throw new Error("QRIS static payload length is invalid");
  }

  const fields = parseQrisFields(normalized);
  const crcField = fields.at(-1);
  if (!crcField || crcField.tag !== "63" || crcField.value.length !== 4) {
    throw new Error("QRIS payload does not end with a CRC field");
  }
  if (qrisCrc16(normalized.slice(0, -4)) !== crcField.value.toUpperCase()) {
    throw new Error("QRIS payload CRC is invalid");
  }

  const pointOfInitiationFields = fields.filter((field) => field.tag === "01");
  if (
    pointOfInitiationFields.length !== 1 ||
    pointOfInitiationFields[0]?.value !== "11"
  ) {
    throw new Error("QRIS base payload must use static point of initiation mode");
  }
  if (fields.some((field) => field.tag === "54")) {
    throw new Error("QRIS base payload must not contain a fixed amount");
  }

  // Exercise the dynamic conversion now so invalid merchant payloads never
  // become activatable configuration.
  buildDynamicQrisPayload(normalized, 1);
  return normalized;
}

export function buildDynamicQrisPayload(basePayload: string, amount: number): string {
  if (!Number.isInteger(amount) || amount <= 0 || amount > 2_147_483_647) {
    throw new Error("QRIS amount must be a positive integer");
  }

  const normalized = basePayload.trim();
  const fields = parseQrisFields(normalized);
  const crcField = fields.at(-1);
  if (!crcField || crcField.tag !== "63" || crcField.value.length !== 4) {
    throw new Error("QRIS payload does not end with a CRC field");
  }
  const crcInput = normalized.slice(0, -4);
  if (qrisCrc16(crcInput) !== crcField.value.toUpperCase()) {
    throw new Error("QRIS payload CRC is invalid");
  }

  let foundPointOfInitiation = false;
  let insertedAmount = false;
  const dynamicFields: QrisField[] = [];

  for (const field of fields.slice(0, -1)) {
    if (field.tag === "01") {
      foundPointOfInitiation = true;
      dynamicFields.push({ tag: "01", value: "12" });
      continue;
    }
    if (field.tag === "54") {
      continue;
    }
    if (!insertedAmount && Number(field.tag) > 54) {
      dynamicFields.push({ tag: "54", value: String(amount) });
      insertedAmount = true;
    }
    dynamicFields.push(field);
  }

  if (!foundPointOfInitiation) {
    throw new Error("QRIS payload does not contain point of initiation method");
  }
  if (!insertedAmount) {
    dynamicFields.push({ tag: "54", value: String(amount) });
  }

  const body = dynamicFields.map(encodeField).join("");
  const withCrcHeader = `${body}6304`;
  return `${withCrcHeader}${qrisCrc16(withCrcHeader)}`;
}

export async function createDynamicQrisPng(
  basePayload: string,
  amount: number,
): Promise<Buffer> {
  return createQrisPng(buildDynamicQrisPayload(basePayload, amount));
}

export async function createQrisPng(payload: string): Promise<Buffer> {
  return QRCode.toBuffer(payload, {
    type: "png",
    // Pure black, a full quiet zone, and high correction survive Telegram
    // photo recompression and gallery scanning more reliably across wallets.
    errorCorrectionLevel: "H",
    margin: 4,
    width: 1024,
    color: { dark: "#000000", light: "#FFFFFF" },
  });
}
