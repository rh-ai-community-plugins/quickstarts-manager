const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000;

export function getCacheTtlMs(): number {
  const envTtl = process.env.CACHE_TTL;
  if (envTtl) {
    const parsed = parseInt(envTtl, 10);
    if (!isNaN(parsed) && parsed > 0) return parsed * 1000;
  }
  return DEFAULT_CACHE_TTL_MS;
}
