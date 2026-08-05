import yaml from 'js-yaml';
import { fetchUrl, FetchOptions } from '../utils/httpClient';
import { buildGitHubRawUrl } from '../utils/github';
import { getCacheTtlMs } from '../utils/cache';
import { QuickstartMetadata, RegistryQuickstart } from '../types/catalog';
import { getSettings } from './settingsService';
import { getProxyAgent } from '../utils/proxyAgent';

const DEFAULT_CONCURRENCY = 5;

interface CacheEntry {
  metadata: QuickstartMetadata | null;
  fetchedAt: number;
}

const cache = new Map<string, CacheEntry>();

function getConcurrency(): number {
  const envVal = process.env.METADATA_FETCH_CONCURRENCY;
  if (envVal) {
    const parsed = parseInt(envVal, 10);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }
  return DEFAULT_CONCURRENCY;
}

function isCacheValid(entry: CacheEntry): boolean {
  return Date.now() - entry.fetchedAt < getCacheTtlMs();
}

async function fetchQuickstartYaml(quickstart: RegistryQuickstart): Promise<QuickstartMetadata | null> {
  const rawUrl = buildGitHubRawUrl(quickstart.repository, quickstart.branch ?? 'main', 'quickstart.yaml');
  if (!rawUrl) {
    console.warn(`Cannot build raw URL for quickstart ${quickstart.name}: ${quickstart.repository}`);
    return null;
  }

  try {
    const fetchOpts: FetchOptions = {};
    const { githubToken } = getSettings();
    if (githubToken) {
      fetchOpts.headers = { Authorization: `Bearer ${githubToken}` };
    }
    const agent = getProxyAgent();
    if (agent) {
      fetchOpts.agent = agent;
    }
    const rawYaml = await fetchUrl(rawUrl, fetchOpts);
    const parsed = yaml.load(rawYaml) as QuickstartMetadata;
    if (!parsed || typeof parsed !== 'object' || !parsed.name || !parsed.displayName || !parsed.version) {
      console.warn(`Invalid quickstart.yaml for ${quickstart.name}: missing required fields`);
      return null;
    }
    return parsed;
  } catch (err) {
    console.warn(`Failed to fetch quickstart.yaml for ${quickstart.name}:`, (err as Error).message);
    return null;
  }
}

export async function getQuickstartMetadata(quickstart: RegistryQuickstart): Promise<QuickstartMetadata | null> {
  const cached = cache.get(quickstart.name);
  if (cached && isCacheValid(cached)) {
    return cached.metadata;
  }

  const metadata = await fetchQuickstartYaml(quickstart);
  cache.set(quickstart.name, { metadata, fetchedAt: Date.now() });
  return metadata;
}

async function runWithConcurrency<T, R>(
  items: T[],
  maxConcurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let index = 0;

  async function worker(): Promise<void> {
    while (index < items.length) {
      const i = index++;
      results[i] = await fn(items[i]);
    }
  }

  const workers = Array.from(
    { length: Math.min(maxConcurrency, items.length) },
    () => worker(),
  );
  await Promise.all(workers);
  return results;
}

export async function getAllQuickstartMetadata(
  quickstarts: RegistryQuickstart[],
): Promise<Map<string, QuickstartMetadata | null>> {
  const concurrency = getConcurrency();
  const results = await runWithConcurrency(quickstarts, concurrency, async (qs) => ({
    name: qs.name,
    metadata: await getQuickstartMetadata(qs),
  }));

  const map = new Map<string, QuickstartMetadata | null>();
  for (const result of results) {
    map.set(result.name, result.metadata);
  }
  return map;
}

export function clearMetadataCache(name?: string): void {
  if (name) {
    cache.delete(name);
  } else {
    cache.clear();
  }
}
