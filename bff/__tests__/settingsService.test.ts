import fs from 'fs';
import { getSettings, refreshSettings, updateSettings } from '../src/services/settingsService';
import * as k8sApiClient from '../src/services/k8sApiClient';

jest.mock('fs');
jest.mock('../src/services/k8sApiClient', () => {
  const actual = jest.requireActual('../src/services/k8sApiClient');
  return {
    ...actual,
    k8sApiRequest: jest.fn(),
  };
});

const mockedReadFileSync = jest.mocked(fs.readFileSync);
const mockedK8sApiRequest = jest.mocked(k8sApiClient.k8sApiRequest);

describe('settingsService', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetAllMocks();
    refreshSettings();
    process.env = { ...originalEnv };
    delete process.env.GITHUB_TOKEN;
    delete process.env.HTTPS_PROXY;
    delete process.env.HTTP_PROXY;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('getSettings', () => {
    it('reads settings from volume-mounted files', () => {
      mockedReadFileSync.mockImplementation((filePath: fs.PathOrFileDescriptor) => {
        const p = String(filePath);
        if (p.endsWith('github-token')) return 'ghp_test123';
        if (p.endsWith('proxy-url')) return 'http://proxy:3128';
        throw new Error('ENOENT');
      });

      const settings = getSettings();
      expect(settings).toEqual({
        githubToken: 'ghp_test123',
        proxyUrl: 'http://proxy:3128',
        source: 'secret',
      });
    });

    it('falls back to env vars when files are not present', () => {
      mockedReadFileSync.mockImplementation(() => {
        throw new Error('ENOENT');
      });
      process.env.GITHUB_TOKEN = 'ghp_env_token';

      const settings = getSettings();
      expect(settings).toEqual({
        githubToken: 'ghp_env_token',
        proxyUrl: null,
        source: 'env',
      });
    });

    it('reads HTTPS_PROXY env var for proxy', () => {
      mockedReadFileSync.mockImplementation(() => {
        throw new Error('ENOENT');
      });
      process.env.HTTPS_PROXY = 'http://env-proxy:8080';

      const settings = getSettings();
      expect(settings).toEqual({
        githubToken: null,
        proxyUrl: 'http://env-proxy:8080',
        source: 'env',
      });
    });

    it('reads HTTP_PROXY as fallback when HTTPS_PROXY is not set', () => {
      mockedReadFileSync.mockImplementation(() => {
        throw new Error('ENOENT');
      });
      process.env.HTTP_PROXY = 'http://http-proxy:8080';

      const settings = getSettings();
      expect(settings.proxyUrl).toBe('http://http-proxy:8080');
    });

    it('returns defaults when nothing is configured', () => {
      mockedReadFileSync.mockImplementation(() => {
        throw new Error('ENOENT');
      });

      const settings = getSettings();
      expect(settings).toEqual({
        githubToken: null,
        proxyUrl: null,
        source: 'default',
      });
    });

    it('caches results within TTL', () => {
      mockedReadFileSync.mockImplementation(() => {
        throw new Error('ENOENT');
      });
      process.env.GITHUB_TOKEN = 'token1';

      const first = getSettings();
      process.env.GITHUB_TOKEN = 'token2';
      const second = getSettings();

      expect(first).toBe(second);
      expect(first.githubToken).toBe('token1');
    });

    it('trims whitespace from file contents', () => {
      mockedReadFileSync.mockImplementation((filePath: fs.PathOrFileDescriptor) => {
        const p = String(filePath);
        if (p.endsWith('github-token')) return '  ghp_trimmed  \n';
        throw new Error('ENOENT');
      });

      const settings = getSettings();
      expect(settings.githubToken).toBe('ghp_trimmed');
    });

    it('treats empty file contents as null', () => {
      mockedReadFileSync.mockImplementation((filePath: fs.PathOrFileDescriptor) => {
        const p = String(filePath);
        if (p.endsWith('github-token')) return '   \n';
        if (p.endsWith('proxy-url')) return '';
        throw new Error('ENOENT');
      });

      const settings = getSettings();
      expect(settings.source).toBe('default');
    });

    it('prefers file values over env vars', () => {
      mockedReadFileSync.mockImplementation((filePath: fs.PathOrFileDescriptor) => {
        const p = String(filePath);
        if (p.endsWith('github-token')) return 'file-token';
        throw new Error('ENOENT');
      });
      process.env.GITHUB_TOKEN = 'env-token';

      const settings = getSettings();
      expect(settings.githubToken).toBe('file-token');
      expect(settings.source).toBe('secret');
    });
  });

  describe('refreshSettings', () => {
    it('invalidates cache so next getSettings re-reads', () => {
      mockedReadFileSync.mockImplementation(() => {
        throw new Error('ENOENT');
      });
      process.env.GITHUB_TOKEN = 'token1';
      getSettings();

      process.env.GITHUB_TOKEN = 'token2';
      refreshSettings();
      const settings = getSettings();

      expect(settings.githubToken).toBe('token2');
    });
  });

  describe('updateSettings', () => {
    it('PUTs secret with base64-encoded data', async () => {
      mockedK8sApiRequest.mockResolvedValue({});

      await updateSettings('admin-token', 'test-ns', {
        githubToken: 'ghp_new',
        proxyUrl: 'http://proxy:3128',
      });

      expect(mockedK8sApiRequest).toHaveBeenCalledWith(
        'admin-token',
        '/api/v1/namespaces/test-ns/secrets/quickstarts-manager-settings',
        'PUT',
        expect.objectContaining({
          data: {
            'github-token': Buffer.from('ghp_new').toString('base64'),
            'proxy-url': Buffer.from('http://proxy:3128').toString('base64'),
          },
        }),
      );
    });

    it('creates secret via POST when PUT returns 404', async () => {
      mockedK8sApiRequest
        .mockRejectedValueOnce(new k8sApiClient.K8sApiError(404, 'Not found'))
        .mockResolvedValueOnce({});

      await updateSettings('admin-token', 'test-ns', { githubToken: 'token' });

      expect(mockedK8sApiRequest).toHaveBeenCalledTimes(2);
      expect(mockedK8sApiRequest).toHaveBeenLastCalledWith(
        'admin-token',
        '/api/v1/namespaces/test-ns/secrets',
        'POST',
        expect.objectContaining({
          kind: 'Secret',
          metadata: { name: 'quickstarts-manager-settings', namespace: 'test-ns' },
        }),
      );
    });

    it('omits null values from secret data', async () => {
      mockedK8sApiRequest.mockResolvedValue({});

      await updateSettings('admin-token', 'test-ns', {
        githubToken: 'token',
        proxyUrl: null,
      });

      const call = mockedK8sApiRequest.mock.calls[0];
      const body = call[3] as { data: Record<string, string> };
      expect(body.data).toEqual({
        'github-token': Buffer.from('token').toString('base64'),
      });
      expect(body.data['proxy-url']).toBeUndefined();
    });

    it('rethrows non-404 errors', async () => {
      mockedK8sApiRequest.mockRejectedValue(
        new k8sApiClient.K8sApiError(403, 'Forbidden'),
      );

      await expect(
        updateSettings('token', 'ns', { githubToken: 'x' }),
      ).rejects.toThrow('Forbidden');
    });

    it('invalidates cache after successful update', async () => {
      mockedK8sApiRequest.mockResolvedValue({});
      mockedReadFileSync.mockImplementation(() => {
        throw new Error('ENOENT');
      });

      process.env.GITHUB_TOKEN = 'old';
      getSettings();

      await updateSettings('token', 'ns', { githubToken: 'new' });

      process.env.GITHUB_TOKEN = 'refreshed';
      const settings = getSettings();
      expect(settings.githubToken).toBe('refreshed');
    });
  });
});
