// Fetches a Helm chart from a single subdirectory of a GitHub repository using the
// GitHub Git Trees + Blobs API, instead of downloading and extracting a full repo
// tarball. This avoids paying the bandwidth/time cost of the entire repository when
// only a `chart/` subdirectory is needed.
//
// Supports GitHub Enterprise Server via a configurable API base: set GITHUB_API_BASE
// to override entirely, or the API base is derived from the repo URL's host
// (github.com -> api.github.com, any other host -> https://<host>/api/v3).
import https from 'https';
import http from 'http';
import fs from 'fs';
import os from 'os';
import path from 'path';

export const MAX_CHART_BYTES = 50 * 1024 * 1024;
export const MAX_BLOB_BYTES = 25 * 1024 * 1024;
export const REQUEST_TIMEOUT_MS = 30_000;
export const MAX_REDIRECTS = 5;
export const BLOB_CONCURRENCY = 5;

const SAFE_PATH_PATTERN = /^[a-zA-Z0-9._-]+(\/[a-zA-Z0-9._-]+)*\/?$/;

export interface ChartFetchOptions {
  token?: string;
  agent?: http.Agent;
}

export interface ExtractedChart {
  chartPath: string;
  tmpDir: string;
}

export class GitHubApiError extends Error {
  statusCode?: number;

  constructor(message: string, statusCode?: number) {
    super(message);
    this.name = 'GitHubApiError';
    this.statusCode = statusCode;
  }
}

interface TreeEntry {
  path: string;
  type: string;
  sha: string;
  size?: number;
}

interface TreeResponse {
  tree: TreeEntry[];
  truncated?: boolean;
}

interface BlobResponse {
  content: string;
  encoding: string;
}

function resolveApiBase(host: string): string {
  const override = process.env.GITHUB_API_BASE?.trim();
  if (override) return override.replace(/\/+$/, '');
  if (host === 'github.com' || host === 'www.github.com') return 'https://api.github.com';
  return `https://${host}/api/v3`;
}

export function parseRepoUrl(repoUrl: string): { apiBase: string; owner: string; repo: string } | null {
  let parsed: URL;
  try {
    parsed = new URL(repoUrl);
  } catch {
    return null;
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return null;
  }

  const segments = parsed.pathname.split('/').filter((seg) => seg.length > 0);
  if (segments.length < 2) {
    return null;
  }

  const owner = segments[0];
  const repo = segments[1].replace(/\.git$/, '');
  const apiBase = resolveApiBase(parsed.hostname);

  return { apiBase, owner, repo };
}

interface RawResponse {
  status: number;
  headers: http.IncomingHttpHeaders;
  body: string;
}

function requestOnce(
  url: string,
  options: ChartFetchOptions,
  redirectsRemaining: number,
  originalHost?: string,
): Promise<RawResponse> {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const currentHost = new URL(url).hostname;
    const effectiveOriginalHost = originalHost ?? currentHost;

    const requestHeaders: Record<string, string> = {
      'User-Agent': 'quickstarts-manager-bff',
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    };
    if (options.token) {
      requestHeaders['Authorization'] = `Bearer ${options.token}`;
    }

    // Strip auth header on cross-host redirects to prevent token leakage
    if (currentHost !== effectiveOriginalHost) {
      delete requestHeaders['Authorization'];
    }

    const requestOptions: https.RequestOptions = {
      timeout: REQUEST_TIMEOUT_MS,
      headers: requestHeaders,
    };
    if (options.agent) {
      requestOptions.agent = options.agent;
    }

    const req = client.get(url, requestOptions, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        if (redirectsRemaining <= 0) {
          reject(new GitHubApiError('Too many redirects from GitHub API'));
          return;
        }
        const resolved = new URL(res.headers.location, url).href;
        requestOnce(resolved, options, redirectsRemaining - 1, effectiveOriginalHost).then(resolve, reject);
        return;
      }

      let totalBytes = 0;
      const chunks: Buffer[] = [];

      res.on('data', (chunk: Buffer) => {
        totalBytes += chunk.length;
        if (totalBytes > MAX_BLOB_BYTES) {
          res.destroy();
          reject(new GitHubApiError(`GitHub API response exceeds ${MAX_BLOB_BYTES} bytes`));
          return;
        }
        chunks.push(chunk);
      });

      res.on('end', () => {
        resolve({
          status: res.statusCode ?? 0,
          headers: res.headers,
          body: Buffer.concat(chunks).toString('utf-8'),
        });
      });

      res.on('error', (err) => {
        reject(new GitHubApiError(err.message));
      });
    });

    req.on('error', (err) => {
      reject(new GitHubApiError(err.message));
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new GitHubApiError(`GitHub API request timed out after ${REQUEST_TIMEOUT_MS}ms`));
    });
  });
}

async function githubApiGet(url: string, options: ChartFetchOptions = {}): Promise<unknown> {
  const response = await requestOnce(url, options, MAX_REDIRECTS);

  if (
    (response.status === 403 || response.status === 429) &&
    response.headers['x-ratelimit-remaining'] === '0'
  ) {
    let resetInfo = '';
    const resetHeader = response.headers['x-ratelimit-reset'];
    if (resetHeader) {
      const resetSeconds = parseInt(Array.isArray(resetHeader) ? resetHeader[0] : resetHeader, 10);
      if (!isNaN(resetSeconds)) {
        resetInfo = ` Resets at ${new Date(resetSeconds * 1000).toISOString()}.`;
      }
    }
    throw new GitHubApiError(
      `GitHub API rate limit exceeded.${resetInfo} Configure a GitHub token in Settings to raise the limit.`,
      response.status,
    );
  }

  if (response.status === 403 || response.status === 429) {
    throw new GitHubApiError(`GitHub API request forbidden (HTTP ${response.status})`, response.status);
  }

  if (response.status < 200 || response.status >= 300) {
    throw new GitHubApiError(`GitHub API returned HTTP ${response.status}`, response.status);
  }

  try {
    return JSON.parse(response.body);
  } catch {
    throw new GitHubApiError('Failed to parse GitHub API response');
  }
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

export async function downloadRepoChart(
  repoUrl: string,
  chartPath: string,
  ref: string = 'main',
  options: ChartFetchOptions = {},
): Promise<ExtractedChart> {
  const normalizedChartPath = chartPath.replace(/\/+$/, '');
  if (
    !SAFE_PATH_PATTERN.test(normalizedChartPath) ||
    normalizedChartPath.split('/').some((seg) => seg === '..')
  ) {
    throw new Error(`Invalid chart path: "${chartPath}"`);
  }

  const parsedRepo = parseRepoUrl(repoUrl);
  if (!parsedRepo) {
    throw new Error(`Cannot parse GitHub repository URL: "${repoUrl}"`);
  }
  const { apiBase, owner, repo } = parsedRepo;

  const treeUrl = `${apiBase}/repos/${owner}/${repo}/git/trees/${encodeURIComponent(ref)}?recursive=1`;
  const tree = (await githubApiGet(treeUrl, options)) as TreeResponse;

  if (!tree || !Array.isArray(tree.tree)) {
    throw new Error('Unexpected response from GitHub Trees API');
  }

  const prefix = `${normalizedChartPath}/`;
  const blobs = tree.tree.filter((e) => e.type === 'blob' && e.path.startsWith(prefix));

  if (blobs.length === 0) {
    if (tree.truncated) {
      throw new Error(
        `Repository tree too large to enumerate for chart path "${chartPath}". Consider an OCI chart reference.`,
      );
    }
    throw new Error(
      `No files found at chart path "${chartPath}" in the repository. Verify deployment.chart.path in quickstart.yaml.`,
    );
  }

  const chartYamlPath = `${normalizedChartPath}/Chart.yaml`;
  const hasChartYaml = blobs.some((b) => b.path === chartYamlPath);
  if (!hasChartYaml) {
    throw new Error(
      `No Chart.yaml found at "${chartPath}" in the repository. Verify the chart path in quickstart.yaml.`,
    );
  }

  // The recursive tree is capped by GitHub (~100k entries / 7MB). If it was truncated we
  // may have only a subset of the chart's files, which would install an incomplete chart.
  // We can't detect exactly which files are missing, so surface the risk rather than fail
  // outright — the chart may still be complete if it sits early in the tree.
  if (tree.truncated) {
    console.warn(
      `GitHub tree for chart path "${chartPath}" was truncated; the fetched chart may be incomplete. ` +
      'Consider an OCI chart reference for large repositories.',
    );
  }

  const totalSize = blobs.reduce((sum, b) => sum + (b.size ?? 0), 0);
  if (totalSize > MAX_CHART_BYTES) {
    throw new Error(`Chart at "${chartPath}" exceeds ${MAX_CHART_BYTES} bytes`);
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qs-chart-'));

  try {
    const chartRoot = path.join(tmpDir, 'chart');
    fs.mkdirSync(chartRoot);

    await runWithConcurrency(blobs, BLOB_CONCURRENCY, async (blob) => {
      const relativePath = blob.path.slice(prefix.length);
      const destPath = path.join(chartRoot, relativePath);

      const resolved = path.resolve(destPath);
      const resolvedRoot = path.resolve(chartRoot);
      if (resolved !== resolvedRoot && !resolved.startsWith(resolvedRoot + path.sep)) {
        throw new Error('Chart file path escapes the target directory');
      }

      fs.mkdirSync(path.dirname(destPath), { recursive: true });

      const blobUrl = `${apiBase}/repos/${owner}/${repo}/git/blobs/${blob.sha}`;
      const data = (await githubApiGet(blobUrl, options)) as BlobResponse;

      if (typeof data.content !== 'string') {
        throw new Error('Unexpected blob response from GitHub API');
      }

      let buffer: Buffer;
      if (data.encoding === 'base64') {
        buffer = Buffer.from(data.content, 'base64');
      } else if (data.encoding === 'utf-8') {
        buffer = Buffer.from(data.content, 'utf-8');
      } else {
        throw new Error(`Unsupported blob encoding: ${data.encoding}`);
      }

      fs.writeFileSync(destPath, buffer);
    });

    return { chartPath: chartRoot, tmpDir };
  } catch (err) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    throw err;
  }
}

export function cleanupExtractedChart(tmpDir: string): void {
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    // best-effort
  }
}
