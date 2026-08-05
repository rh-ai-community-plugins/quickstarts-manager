import fs from 'fs';
import path from 'path';
import { k8sApiRequest, K8sApiError } from './k8sApiClient';

export interface PluginSettings {
  githubToken: string | null;
  proxyUrl: string | null;
  source: 'secret' | 'env' | 'default';
}

const SETTINGS_MOUNT_PATH = process.env.SETTINGS_MOUNT_PATH ?? '/etc/quickstarts-manager/settings';
const SECRET_NAME = 'quickstarts-manager-settings';
const CACHE_TTL_MS = 30_000;

interface CachedSettings {
  settings: PluginSettings;
  readAt: number;
}

let cached: CachedSettings | null = null;

function readFileOrNull(filePath: string): string | null {
  try {
    const content = fs.readFileSync(filePath, 'utf-8').trim();
    return content || null;
  } catch {
    return null;
  }
}

function readFromFiles(): { githubToken: string | null; proxyUrl: string | null } | null {
  const githubToken = readFileOrNull(path.join(SETTINGS_MOUNT_PATH, 'github-token'));
  const proxyUrl = readFileOrNull(path.join(SETTINGS_MOUNT_PATH, 'proxy-url'));
  if (githubToken !== null || proxyUrl !== null) {
    return { githubToken, proxyUrl };
  }
  return null;
}

function readFromEnv(): { githubToken: string | null; proxyUrl: string | null } | null {
  const githubToken = process.env.GITHUB_TOKEN?.trim() || null;
  const proxyUrl = process.env.HTTPS_PROXY?.trim() || process.env.HTTP_PROXY?.trim() || null;
  if (githubToken !== null || proxyUrl !== null) {
    return { githubToken, proxyUrl };
  }
  return null;
}

export function getSettings(): PluginSettings {
  if (cached && Date.now() - cached.readAt < CACHE_TTL_MS) {
    return cached.settings;
  }

  const fromFiles = readFromFiles();
  if (fromFiles) {
    const settings: PluginSettings = { ...fromFiles, source: 'secret' };
    cached = { settings, readAt: Date.now() };
    return settings;
  }

  const fromEnv = readFromEnv();
  if (fromEnv) {
    const settings: PluginSettings = { ...fromEnv, source: 'env' };
    cached = { settings, readAt: Date.now() };
    return settings;
  }

  const settings: PluginSettings = { githubToken: null, proxyUrl: null, source: 'default' };
  cached = { settings, readAt: Date.now() };
  return settings;
}

export function refreshSettings(): void {
  cached = null;
}

interface K8sSecret {
  apiVersion: string;
  kind: string;
  metadata: { name: string; namespace: string };
  data?: Record<string, string>;
}

export async function updateSettings(
  token: string,
  namespace: string,
  settings: { githubToken?: string | null; proxyUrl?: string | null },
): Promise<void> {
  const secretPath = `/api/v1/namespaces/${encodeURIComponent(namespace)}/secrets/${SECRET_NAME}`;

  const data: Record<string, string> = {};
  if (settings.githubToken) {
    data['github-token'] = Buffer.from(settings.githubToken).toString('base64');
  }
  if (settings.proxyUrl) {
    data['proxy-url'] = Buffer.from(settings.proxyUrl).toString('base64');
  }

  const secretBody: K8sSecret = {
    apiVersion: 'v1',
    kind: 'Secret',
    metadata: { name: SECRET_NAME, namespace },
    data,
  };

  try {
    await k8sApiRequest(token, secretPath, 'PUT', secretBody);
  } catch (err) {
    if (err instanceof K8sApiError && err.statusCode === 404) {
      const createPath = `/api/v1/namespaces/${encodeURIComponent(namespace)}/secrets`;
      await k8sApiRequest(token, createPath, 'POST', secretBody);
    } else {
      throw err;
    }
  }

  refreshSettings();
}
