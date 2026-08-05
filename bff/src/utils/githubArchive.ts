import https from 'https';
import http from 'http';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFile } from 'child_process';

const MAX_ARCHIVE_BYTES = 50 * 1024 * 1024;
const DOWNLOAD_TIMEOUT_MS = 60_000;
const MAX_REDIRECTS = 5;

const GITHUB_URL_PATTERN = /github\.com\/([^/]+)\/([^/]+)/;
const SAFE_PATH_PATTERN = /^[a-zA-Z0-9._-]+(\/[a-zA-Z0-9._-]+)*\/?$/;

export interface ArchiveOptions {
  headers?: Record<string, string>;
  agent?: http.Agent;
}

export interface ExtractedChart {
  chartPath: string;
  tmpDir: string;
}

export function buildGitHubArchiveUrl(repoUrl: string, ref: string): string | null {
  const match = repoUrl.match(GITHUB_URL_PATTERN);
  if (!match) return null;
  const [, owner, repo] = match;
  const cleanRepo = repo.replace(/\.git$/, '');
  return `https://api.github.com/repos/${owner}/${cleanRepo}/tarball/${encodeURIComponent(ref)}`;
}

function downloadToFile(
  url: string,
  destPath: string,
  options: ArchiveOptions = {},
  originalHost?: string,
  redirectsRemaining = MAX_REDIRECTS,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const currentHost = new URL(url).hostname;
    const requestHeaders: Record<string, string> = {
      'User-Agent': 'quickstarts-manager-bff',
      Accept: 'application/vnd.github+json',
      ...options.headers,
    };

    // Strip auth header on cross-origin redirects to prevent token leakage to CDN
    if (originalHost && currentHost !== originalHost) {
      delete requestHeaders['Authorization'];
    }

    const requestOptions: https.RequestOptions = {
      timeout: DOWNLOAD_TIMEOUT_MS,
      headers: requestHeaders,
    };
    if (options.agent) {
      requestOptions.agent = options.agent;
    }

    const req = client.get(url, requestOptions, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        if (redirectsRemaining <= 0) {
          reject(new Error('Too many redirects downloading archive'));
          return;
        }
        const resolved = new URL(res.headers.location, url).href;
        downloadToFile(resolved, destPath, options, originalHost ?? currentHost, redirectsRemaining - 1)
          .then(resolve, reject);
        return;
      }

      if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
        res.resume();
        reject(new Error(`HTTP ${res.statusCode} downloading archive`));
        return;
      }

      let totalBytes = 0;
      const fileStream = fs.createWriteStream(destPath);

      res.on('data', (chunk: Buffer) => {
        totalBytes += chunk.length;
        if (totalBytes > MAX_ARCHIVE_BYTES) {
          res.destroy();
          fileStream.destroy();
          reject(new Error(`Archive exceeds ${MAX_ARCHIVE_BYTES} bytes`));
        }
      });

      res.pipe(fileStream);
      fileStream.on('finish', () => resolve());
      fileStream.on('error', reject);
      res.on('error', reject);
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`Timed out downloading archive after ${DOWNLOAD_TIMEOUT_MS}ms`));
    });
  });
}

function extractTarball(archivePath: string, destDir: string): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile('tar', ['xzf', archivePath, '-C', destDir], { timeout: 30_000 }, (error) => {
      if (error) {
        reject(new Error(`Failed to extract archive: ${error.message}`));
      } else {
        resolve();
      }
    });
  });
}

export async function downloadRepoChart(
  repoUrl: string,
  chartPath: string,
  ref: string = 'main',
  options: ArchiveOptions = {},
): Promise<ExtractedChart> {
  const normalizedChartPath = chartPath.replace(/\/+$/, '');
  if (!SAFE_PATH_PATTERN.test(normalizedChartPath) ||
      normalizedChartPath.split('/').some((seg) => seg === '..')) {
    throw new Error(`Invalid chart path: "${chartPath}"`);
  }

  const archiveUrl = buildGitHubArchiveUrl(repoUrl, ref);
  if (!archiveUrl) {
    throw new Error(`Cannot build archive URL from repository: "${repoUrl}"`);
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qs-chart-'));

  try {
    const archivePath = path.join(tmpDir, 'archive.tar.gz');
    await downloadToFile(archiveUrl, archivePath, options);

    const extractDir = path.join(tmpDir, 'extracted');
    fs.mkdirSync(extractDir);
    await extractTarball(archivePath, extractDir);

    // GitHub tarballs have a single top-level directory like "owner-repo-sha/"
    const entries = fs.readdirSync(extractDir);
    if (entries.length !== 1) {
      throw new Error(
        `Unexpected archive structure: expected 1 top-level directory, found ${entries.length}`,
      );
    }
    const topLevelDir = path.join(extractDir, entries[0]);

    const resolvedChartPath = path.join(topLevelDir, normalizedChartPath);

    // Containment check: prevent symlink/traversal escapes
    const realChartPath = fs.realpathSync(resolvedChartPath);
    const realExtractDir = fs.realpathSync(extractDir);
    if (!realChartPath.startsWith(realExtractDir + path.sep) && realChartPath !== realExtractDir) {
      throw new Error('Chart path escapes the repository archive');
    }

    const chartYamlPath = path.join(realChartPath, 'Chart.yaml');
    if (!fs.existsSync(chartYamlPath)) {
      throw new Error(
        `No Chart.yaml found at "${chartPath}" in the repository. ` +
        'Verify the chart path in quickstart.yaml.',
      );
    }

    return { chartPath: realChartPath, tmpDir };
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
