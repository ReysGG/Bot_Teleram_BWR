type JsonRecord = Record<string, unknown>;

export type StockQuotaWindow = {
  key: string;
  label: string;
  used: number;
  total: number;
  remaining: number;
  resetAt: string | null;
};

export type StockQuotaSnapshot = {
  version: 1;
  plan: string;
  limitReached: boolean;
  checkedAt: string;
  quotas: StockQuotaWindow[];
};

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function finiteNumber(value: unknown, fallback = 0): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function isoDate(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = new Date(
    typeof value === "number" && value < 1e12 ? value * 1000 : String(value),
  );
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

function rateLimitBody(value: unknown): JsonRecord | null {
  if (!isRecord(value)) return null;
  return isRecord(value.rate_limit) ? value.rate_limit : value;
}

function quotaWindow(
  key: string,
  label: string,
  value: unknown,
): StockQuotaWindow | null {
  if (!isRecord(value)) return null;
  const used = Math.max(
    0,
    Math.min(100, finiteNumber(value.used_percent ?? value.percent_used, 0)),
  );
  return {
    key,
    label,
    used,
    total: 100,
    remaining: Math.max(0, 100 - used),
    resetAt: isoDate(value.reset_at ?? value.resets_at ?? value.resetAt),
  };
}

function appendWindows(
  output: StockQuotaWindow[],
  prefix: "" | "review",
  snapshot: unknown,
) {
  const rateLimit = rateLimitBody(snapshot);
  if (!rateLimit) return;

  const source = isRecord(snapshot) ? snapshot : {};
  const primary =
    rateLimit.primary_window ??
    rateLimit.primary ??
    source.primary_window ??
    source.primary;
  const secondary =
    rateLimit.secondary_window ??
    rateLimit.secondary ??
    source.secondary_window ??
    source.secondary;
  const primaryQuota = quotaWindow(
    prefix ? "review_session" : "session",
    prefix ? "Review 5 jam" : "5 jam",
    primary,
  );
  const secondaryQuota = quotaWindow(
    prefix ? "review_weekly" : "weekly",
    prefix ? "Review mingguan" : "Mingguan",
    secondary,
  );
  if (primaryQuota) output.push(primaryQuota);
  if (secondaryQuota) output.push(secondaryQuota);
}

function reviewRateLimit(data: JsonRecord): unknown {
  if (data.code_review_rate_limit || data.review_rate_limit) {
    return data.code_review_rate_limit ?? data.review_rate_limit;
  }
  const byLimitId = isRecord(data.rate_limits_by_limit_id)
    ? data.rate_limits_by_limit_id
    : null;
  if (byLimitId) {
    const direct = byLimitId.code_review ?? byLimitId.codex_review ?? byLimitId.review;
    if (direct) return direct;
  }
  if (!Array.isArray(data.additional_rate_limits)) return null;
  return data.additional_rate_limits.find((entry) => {
    if (!isRecord(entry)) return false;
    const id = String(
      entry.limit_name ?? entry.metered_feature ?? entry.id ?? "",
    ).toLowerCase();
    return id === "code_review" || id === "codex_review" || id.includes("review");
  });
}

export function parseCodexQuotaSnapshot(
  value: unknown,
  checkedAt = new Date(),
): StockQuotaSnapshot | null {
  if (!isRecord(value)) return null;
  const byLimitId = isRecord(value.rate_limits_by_limit_id)
    ? value.rate_limits_by_limit_id
    : null;
  const normalRateLimit =
    value.rate_limit ?? value.rate_limits ?? byLimitId?.codex ?? {};
  const normalBody = rateLimitBody(normalRateLimit);
  const quotas: StockQuotaWindow[] = [];
  appendWindows(quotas, "", normalRateLimit);
  appendWindows(quotas, "review", reviewRateLimit(value));

  const summary = isRecord(value.summary) ? value.summary : null;
  return {
    version: 1,
    plan: String(value.plan_type ?? summary?.plan ?? "unknown"),
    limitReached: normalBody?.limit_reached === true,
    checkedAt: checkedAt.toISOString(),
    quotas,
  };
}

export function readStockQuotaSnapshot(value: unknown): StockQuotaSnapshot | null {
  if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.quotas)) {
    return null;
  }
  const quotas = value.quotas.filter((entry): entry is StockQuotaWindow => {
    if (!isRecord(entry)) return false;
    return (
      typeof entry.key === "string" &&
      typeof entry.label === "string" &&
      typeof entry.used === "number" &&
      typeof entry.total === "number" &&
      typeof entry.remaining === "number" &&
      (typeof entry.resetAt === "string" || entry.resetAt === null)
    );
  });
  return {
    version: 1,
    plan: typeof value.plan === "string" ? value.plan : "unknown",
    limitReached: value.limitReached === true,
    checkedAt: typeof value.checkedAt === "string" ? value.checkedAt : "",
    quotas,
  };
}
