export function pairSmsCountryButtons<T>(buttons: T[]): T[][] {
  const rows: T[][] = [];
  for (let index = 0; index < buttons.length; index += 2) {
    rows.push(buttons.slice(index, index + 2));
  }
  return rows;
}

export function compactSmsCountryName(name: string, maxLength = 14): string {
  const trimmed = name.trim();
  return trimmed.length <= maxLength
    ? trimmed
    : `${trimmed.slice(0, Math.max(1, maxLength - 1))}…`;
}
