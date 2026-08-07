import {
  parseRepoUrl,
  downloadRepoChart,
  cleanupExtractedChart,
} from '../src/utils/githubChart';
import fs from 'fs';
import https from 'https';
import { EventEmitter } from 'events';

jest.mock('fs', () => {
  const actual = jest.requireActual('fs');
  return {
    ...actual,
    mkdtempSync: jest.fn(),
    mkdirSync: jest.fn(),
    writeFileSync: jest.fn(),
    rmSync: jest.fn(),
  };
});
jest.mock('https');

const mockedFs = jest.mocked(fs);
const mockedHttps = jest.mocked(https);

function createMockResponse(
  statusCode: number,
  body: string,
  headers: Record<string, string> = {},
) {
  const res = new EventEmitter() as any;
  res.statusCode = statusCode;
  res.headers = headers;
  res.resume = jest.fn();
  res.destroy = jest.fn();
  process.nextTick(() => {
    res.emit('data', Buffer.from(body));
    res.emit('end');
  });
  return res;
}

function createMockRequest() {
  const req = new EventEmitter() as any;
  req.destroy = jest.fn();
  return req;
}

function jsonResponse(statusCode: number, body: unknown, headers: Record<string, string> = {}) {
  return createMockResponse(statusCode, JSON.stringify(body), headers);
}

/** Mocks https.get to dispatch a response based on a substring match against the URL. */
function mockGetByUrl(routes: Array<{ match: string; response: any }>) {
  const mockReq = createMockRequest();
  mockedHttps.get.mockImplementation((url: any, optsOrCb: any, maybeCb?: any) => {
    const cb = typeof optsOrCb === 'function' ? optsOrCb : maybeCb;
    const urlStr = url.toString();
    const route = routes.find((r) => urlStr.includes(r.match));
    if (!route) {
      throw new Error(`No mock route configured for URL: ${urlStr}`);
    }
    cb(route.response);
    return mockReq;
  });
  return mockReq;
}

describe('githubChart', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe('parseRepoUrl', () => {
    it('parses github.com URLs', () => {
      const result = parseRepoUrl('https://github.com/org/repo');
      expect(result).toEqual({ apiBase: 'https://api.github.com', owner: 'org', repo: 'repo' });
    });

    it('strips .git suffix from repo name', () => {
      const result = parseRepoUrl('https://github.com/org/repo.git');
      expect(result).toEqual({ apiBase: 'https://api.github.com', owner: 'org', repo: 'repo' });
    });

    it('derives GitHub Enterprise Server API base from host', () => {
      const result = parseRepoUrl('https://ghe.example.com/org/repo');
      expect(result).toEqual({
        apiBase: 'https://ghe.example.com/api/v3',
        owner: 'org',
        repo: 'repo',
      });
    });

    it('is host-agnostic: any valid URL with owner/repo segments parses', () => {
      const result = parseRepoUrl('https://gitlab.com/o/r');
      expect(result).toEqual({ apiBase: 'https://gitlab.com/api/v3', owner: 'o', repo: 'r' });
    });

    it('returns null for a garbage string', () => {
      expect(parseRepoUrl('not a url')).toBeNull();
    });

    it('returns null when the URL has no repo segment', () => {
      expect(parseRepoUrl('https://github.com/onlyowner')).toBeNull();
    });

    it('respects GITHUB_API_BASE env override', () => {
      const prev = process.env.GITHUB_API_BASE;
      process.env.GITHUB_API_BASE = 'https://internal-proxy.example.com/api/';
      try {
        const result = parseRepoUrl('https://github.com/org/repo');
        expect(result?.apiBase).toBe('https://internal-proxy.example.com/api');
      } finally {
        if (prev === undefined) {
          delete process.env.GITHUB_API_BASE;
        } else {
          process.env.GITHUB_API_BASE = prev;
        }
      }
    });
  });

  describe('downloadRepoChart', () => {
    it('rejects path traversal in chart path', async () => {
      await expect(
        downloadRepoChart('https://github.com/org/repo', '../../etc/passwd', 'main'),
      ).rejects.toThrow('Invalid chart path');
    });

    it('rejects chart paths with double dots', async () => {
      await expect(
        downloadRepoChart('https://github.com/org/repo', 'chart/../../../etc', 'main'),
      ).rejects.toThrow('Invalid chart path');
    });

    it('rejects unparseable repository URL', async () => {
      await expect(
        downloadRepoChart('not a url', 'chart/', 'main'),
      ).rejects.toThrow('Cannot parse');
    });

    it('surfaces a rate-limit error when the Trees API is exhausted', async () => {
      mockGetByUrl([
        {
          match: '/git/trees/',
          response: jsonResponse(
            403,
            { message: 'API rate limit exceeded' },
            { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '1700000000' },
          ),
        },
      ]);

      await expect(
        downloadRepoChart('https://github.com/org/repo', 'chart', 'main'),
      ).rejects.toThrow(/rate limit/i);
    });

    it('fails when no files are found at the chart path', async () => {
      mockGetByUrl([
        {
          match: '/git/trees/',
          response: jsonResponse(200, { tree: [{ path: 'README.md', type: 'blob', sha: 'sha0', size: 5 }] }),
        },
      ]);

      await expect(
        downloadRepoChart('https://github.com/org/repo', 'chart', 'main'),
      ).rejects.toThrow(/No files found/);
    });

    it('fails when Chart.yaml is missing from the chart path', async () => {
      mockGetByUrl([
        {
          match: '/git/trees/',
          response: jsonResponse(200, {
            tree: [{ path: 'chart/values.yaml', type: 'blob', sha: 'sha1', size: 5 }],
          }),
        },
      ]);

      await expect(
        downloadRepoChart('https://github.com/org/repo', 'chart', 'main'),
      ).rejects.toThrow(/No Chart\.yaml/);
    });

    it('downloads chart files via Trees + Blobs on the happy path', async () => {
      mockedFs.mkdtempSync.mockReturnValue('/tmp/qs-chart-test' as any);

      const chartYamlContent = Buffer.from('name: test-chart\nversion: 1.0.0\n').toString('base64');
      const templateContent = Buffer.from('kind: Deployment\n').toString('base64');

      mockedHttps.get.mockImplementation((url: any, optsOrCb: any, maybeCb?: any) => {
        const cb = typeof optsOrCb === 'function' ? optsOrCb : maybeCb;
        const urlStr = url.toString();
        const req = createMockRequest();

        if (urlStr.includes('/git/trees/')) {
          cb(
            jsonResponse(200, {
              tree: [
                { path: 'chart/Chart.yaml', type: 'blob', sha: 'sha-chart-yaml', size: 30 },
                { path: 'chart/templates/deployment.yaml', type: 'blob', sha: 'sha-template', size: 18 },
                { path: 'README.md', type: 'blob', sha: 'sha-readme', size: 5 },
              ],
            }),
          );
        } else if (urlStr.includes('/git/blobs/sha-chart-yaml')) {
          cb(jsonResponse(200, { content: chartYamlContent, encoding: 'base64' }));
        } else if (urlStr.includes('/git/blobs/sha-template')) {
          cb(jsonResponse(200, { content: templateContent, encoding: 'base64' }));
        } else {
          throw new Error(`Unexpected URL in happy-path test: ${urlStr}`);
        }
        return req;
      });

      const result = await downloadRepoChart('https://github.com/org/repo', 'chart', 'main');

      expect(mockedFs.mkdtempSync).toHaveBeenCalled();
      expect(result.tmpDir).toBe('/tmp/qs-chart-test');
      expect(result.chartPath).toBe('/tmp/qs-chart-test/chart');

      const chartYamlDest = '/tmp/qs-chart-test/chart/Chart.yaml';
      const templateDest = '/tmp/qs-chart-test/chart/templates/deployment.yaml';
      const readmeDest = '/tmp/qs-chart-test/chart/README.md';

      expect(mockedFs.writeFileSync).toHaveBeenCalledWith(
        chartYamlDest,
        Buffer.from(chartYamlContent, 'base64'),
      );
      expect(mockedFs.writeFileSync).toHaveBeenCalledWith(
        templateDest,
        Buffer.from(templateContent, 'base64'),
      );
      expect(mockedFs.writeFileSync).not.toHaveBeenCalledWith(readmeDest, expect.anything());
    });
  });

  describe('cleanupExtractedChart', () => {
    it('calls rmSync on the temp directory', () => {
      cleanupExtractedChart('/tmp/qs-chart-test');
      expect(mockedFs.rmSync).toHaveBeenCalledWith('/tmp/qs-chart-test', { recursive: true, force: true });
    });

    it('does not throw if rmSync throws', () => {
      mockedFs.rmSync.mockImplementation(() => {
        throw new Error('ENOENT');
      });
      expect(() => cleanupExtractedChart('/tmp/gone')).not.toThrow();
    });
  });
});
