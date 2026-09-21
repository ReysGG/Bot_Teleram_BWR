export type BridgeEventProcessingStatus =
  | "RECEIVED"
  | "CONFIRMED"
  | "DUPLICATE"
  | "REJECTED";

export function existingBridgeEventDisposition(input: {
  status: BridgeEventProcessingStatus;
  payloadHash: string;
  expectedPayloadHash: string;
}): "retry" | "duplicate" {
  if (
    input.status === "RECEIVED" &&
    input.payloadHash === input.expectedPayloadHash
  ) {
    return "retry";
  }
  return "duplicate";
}
