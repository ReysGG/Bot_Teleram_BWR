export const UNIQUE_CODE_MIN = 1;
export const UNIQUE_CODE_MAX = 99;
export const UNIQUE_CODE_COUNT = UNIQUE_CODE_MAX - UNIQUE_CODE_MIN + 1;

export function uniqueCodeCandidates(start: number): number[] {
  if (
    !Number.isInteger(start) ||
    start < UNIQUE_CODE_MIN ||
    start > UNIQUE_CODE_MAX
  ) {
    throw new Error("Unique code start must be an integer between 1 and 99");
  }
  return Array.from(
    { length: UNIQUE_CODE_COUNT },
    (_, offset) =>
      UNIQUE_CODE_MIN +
      ((start - UNIQUE_CODE_MIN + offset) % UNIQUE_CODE_COUNT),
  );
}

export function selectAvailableUniqueCode(input: {
  candidates: number[];
  baseAmount: number;
  activeAmounts: ReadonlySet<number>;
}): number | null {
  for (const code of input.candidates) {
    if (!input.activeAmounts.has(input.baseAmount + code)) {
      return code;
    }
  }
  return null;
}
