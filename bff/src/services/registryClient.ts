import yaml from 'js-yaml';
import { fetchUrl } from '../utils/httpClient';
import { RegistryFile, RegistryQuickstart } from '../types/catalog';

const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000;

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

  const match = repo.match(/github\.com\/([^/]+)\/([^/]+)/);
  if (!match) {
    throw new Error(`Invalid registry repo URL: ${repo}`);
  }
  const [, owner, repoName] = match;
  const cleanRepo = repoName.replace(/\.git$/, '');
  return `https://raw.githubusercontent.com/${owner}/${cleanRepo}/${branch}/${file}`;
}

function getCacheTtl(): number {
  const envTtl = process.env.CACHE_TTL;
  if (envTtl) {
    const parsed = parseInt(envTtl, 10);
    if (!isNaN(parsed) && parsed > 0) return parsed * 1000;
  }
  return DEFAULT_CACHE_TTL_MS;
}

function isCacheValid(): boolean {
  if (!cache) return false;
  return Date.now() - cache.fetchedAt < getCacheTtl();
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

    cache = {
      quickstarts: parsed.quickstarts,
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
