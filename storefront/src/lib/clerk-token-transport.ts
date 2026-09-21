export function clerkCommerceTokenFromAuthorization(value: string | null | undefined) {
  if (!value) return undefined;
  const match = /^Bearer\s+([^\s]+)$/i.exec(value.trim());
  if (!match) return undefined;
  const token = match[1];
  if (token.length > 16_384) return undefined;
  const parts = token.split(".");
  if (parts.length !== 3 || parts.some((part) => !part || !/^[A-Za-z0-9_-]+$/.test(part))) return undefined;
  return `clerk:${token}`;
}
