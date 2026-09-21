type RetryableError = {
  code?: unknown;
  message?: unknown;
  meta?: unknown;
};

const retryablePrismaCodes = new Set(["P2034", "P2037"]);
const retryablePostgresCodes = new Set([
  "40001", // serialization_failure
  "40P01", // deadlock_detected
  "55P03", // lock_not_available
  "53300", // too_many_connections
]);

function errorDetails(error: RetryableError): string {
  const values: string[] =
    typeof error.message === "string" ? [error.message.slice(0, 500)] : [];
  const visit = (value: unknown, depth: number) => {
    if (values.length >= 80 || depth > 4 || value === null) return;
    if (typeof value === "string") {
      values.push(value.slice(0, 500));
      return;
    }
    if (typeof value !== "object") return;
    for (const child of Object.values(value as Record<string, unknown>)) {
      visit(child, depth + 1);
    }
  };
  visit(error.meta, 0);
  return values.join(" ");
}

export function retryableTransactionErrorCode(error: unknown): string | null {
  if (!error || typeof error !== "object") return null;
  const candidate = error as RetryableError;
  const code = typeof candidate.code === "string" ? candidate.code : "";
  if (retryablePrismaCodes.has(code) || retryablePostgresCodes.has(code)) {
    return code;
  }
  const details = errorDetails(candidate);
  const nestedPostgresCode = [...retryablePostgresCodes].find((value) =>
    new RegExp(`\\b${value}\\b`).test(details),
  );
  if (nestedPostgresCode) return nestedPostgresCode;

  // P2028 covers many interactive-transaction failures. Retry only when Prisma
  // explicitly says the transaction could not start; a commit-time error can
  // have an unknown outcome and must never be replayed automatically.
  if (
    code === "P2028" &&
    /(?:unable|failed|timed out).{0,80}(?:start|acquire).{0,40}transaction|transaction.{0,80}(?:start|acquire).{0,40}(?:timed out|failed)/i.test(
      details,
    )
  ) {
    return code;
  }

  return null;
}

export function isRetryableTransactionError(error: unknown): boolean {
  return retryableTransactionErrorCode(error) !== null;
}

type TransactionRetryOptions = {
  label: string;
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  sleep?: (delayMs: number) => Promise<void>;
  random?: () => number;
  onRetry?: (input: {
    label: string;
    attempt: number;
    nextAttempt: number;
    delayMs: number;
    errorCode: string;
  }) => void;
};

function boundedInteger(value: number | undefined, fallback: number, max: number) {
  if (!Number.isInteger(value) || (value ?? 0) < 1) return fallback;
  return Math.min(value!, max);
}

export async function runIdempotentTransactionWithRetry<T>(
  operation: () => Promise<T>,
  options: TransactionRetryOptions,
): Promise<T> {
  const maxAttempts = boundedInteger(options.maxAttempts, 2, 5);
  const baseDelayMs = boundedInteger(options.baseDelayMs, 40, 1_000);
  const maxDelayMs = Math.max(
    baseDelayMs,
    boundedInteger(options.maxDelayMs, 250, 2_000),
  );
  const sleep =
    options.sleep ??
    ((delayMs: number) =>
      new Promise<void>((resolve) => {
        setTimeout(resolve, delayMs);
      }));
  const random = options.random ?? Math.random;

  for (let attempt = 1; ; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      const errorCode = retryableTransactionErrorCode(error);
      if (!errorCode || attempt >= maxAttempts) throw error;

      const backoff = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1));
      const delayMs = backoff + Math.floor(random() * Math.max(1, baseDelayMs));
      const retry = {
        label: options.label,
        attempt,
        nextAttempt: attempt + 1,
        delayMs,
        errorCode,
      };
      if (options.onRetry) {
        options.onRetry(retry);
      } else {
        console.warn("[Database transaction retry]", retry);
      }
      await sleep(delayMs);
    }
  }
}
