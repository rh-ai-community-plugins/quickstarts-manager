import yaml from 'js-yaml';
import { fetchUrl } from '../utils/httpClient';
import { buildGitHubRawUrl } from '../utils/github';
import { getCacheTtlMs } from '../utils/cache';
import { RegistryFile, RegistryQuickstart } from '../types/catalog';

interface CacheEntry {
  quickstarts: RegistryQuickstart[];
  fetchedAt: number;
}

let cache: CacheEntry | null = null;

function getRegistryUrl(): string {
  const repo = process.env.QUICKSTART_REGISTRY_REPO
    ?? 'https://github.com/rh-ai-community-plugins/quickstarts-manager';
  const branch = process.env.QUICKSTART_REGISTRY_BRANCH ?? 'main';
  const file = process.env.QUICKSTART_REGISTRY_FILE ?? 'quickstarts.yaml';

  const url = buildGitHubRawUrl(repo, branch, file);
  if (!url) {
    throw new Error(`Invalid registry repo URL: ${repo}`);
  }
  return url;
}

function isCacheValid(): boolean {
  if (!cache) return false;
  return Date.now() - cache.fetchedAt < getCacheTtlMs();
}

function isValidEntry(entry: unknown): entry is RegistryQuickstart {
  if (!entry || typeof entry !== 'object') return false;
  const e = entry as Record<string, unknown>;
  return typeof e.name === 'string' && e.name.length > 0
    && typeof e.repository === 'string' && e.repository.length > 0;
}

export async function getRegistryQuickstarts(forceRefresh = false): Promise<RegistryQuickstart[]> {
  if (!forceRefresh && isCacheValid()) {
    return cache!.quickstarts;
  }

  const staleCache = cache;

  try {
    const rawYaml = await fetchUrl(getRegistryUrl());
    const parsed = yaml.load(rawYaml) as RegistryFile;

    if (!parsed || !Array.isArray(parsed.quickstarts)) {
      throw new Error('Invalid registry format: missing quickstarts array');
    }

    const validEntries = parsed.quickstarts.filter((entry) => {
      if (isValidEntry(entry)) return true;
      console.warn('Skipping invalid registry entry:', JSON.stringify(entry));
      return false;
    });

    cache = {
      quickstarts: validEntries,
      fetchedAt: Date.now(),
    };

    return cache.quickstarts;
  } catch (err) {
    if (staleCache) {
      console.warn('Registry fetch failed, serving stale cache:', (err as Error).message);
      return staleCache.quickstarts;
    }
    throw err;
  }
}

export function clearRegistryCache(): void {
  cache = null;
}
