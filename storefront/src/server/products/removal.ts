export function productRemovalMode(input: {
  hasOrderHistory: boolean;
  status: "ACTIVE" | "INACTIVE";
}): "DELETE" | "DEACTIVATE" | "PROTECTED" {
  if (!input.hasOrderHistory) return "DELETE";
  return input.status === "ACTIVE" ? "DEACTIVATE" : "PROTECTED";
}
