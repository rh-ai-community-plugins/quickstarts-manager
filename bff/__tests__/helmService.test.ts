import { execFile } from 'child_process';
import fs from 'fs';
import {
  helmInstall,
  helmUpgrade,
  helmUninstall,
  helmList,
  validateHelmValues,
  sanitizeHelmError,
  HelmRelease,
} from '../src/services/helmService';

jest.mock('child_process');
jest.mock('../src/utils/k8sClient', () => ({
  getK8sBaseUrl: () => 'https://my-cluster:6443',
}));

const mockedExecFile = jest.mocked(execFile);

function mockHelmSuccess(stdout: string) {
  mockedExecFile.mockImplementation(
    (_cmd: unknown, _args: unknown, _opts: unknown, callback: unknown) => {
      (callback as (err: null, stdout: string, stderr: string) => void)(null, stdout, '');
      return {} as ReturnType<typeof execFile>;
    },
  );
}

function mockHelmFailure(stderr: string) {
  mockedExecFile.mockImplementation(
    (_cmd: unknown, _args: unknown, _opts: unknown, callback: unknown) => {
      const error = new Error(stderr);
      (callback as (err: Error, stdout: string, stderr: string) => void)(error, '', stderr);
      return {} as ReturnType<typeof execFile>;
    },
  );
}

describe('helmService', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetAllMocks();
    process.env = { ...originalEnv };
    process.env.K8S_API_BASE = 'https://my-cluster:6443';

    jest.spyOn(fs, 'mkdtempSync').mockReturnValue('/tmp/helm-abc123');
    jest.spyOn(fs, 'writeFileSync').mockImplementation(() => {});
    jest.spyOn(fs, 'rmSync').mockImplementation(() => {});
    jest.spyOn(fs, 'existsSync').mockReturnValue(false);
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('validateHelmValues', () => {
    it('accepts valid values', () => {
      expect(() =>
        validateHelmValues({
          'image.tag': '1.0.0',
          replicas: 3,
          debug: true,
          'app.name': 'my-app',
        }),
      ).not.toThrow();
    });

    it('rejects keys with invalid characters', () => {
      expect(() => validateHelmValues({ 'invalid key!': 'value' })).toThrow(
        'Invalid Helm value key',
      );
    });

    it('rejects non-primitive values', () => {
      expect(() =>
        validateHelmValues({ nested: { key: 'value' } as unknown }),
      ).toThrow('only string, number, and boolean');
    });

    it('rejects string values with disallowed characters', () => {
      expect(() =>
        validateHelmValues({ cmd: '$(malicious)' }),
      ).toThrow('disallowed characters');
    });

    it('rejects array values', () => {
      expect(() =>
        validateHelmValues({ list: ['a', 'b'] as unknown }),
      ).toThrow('only string, number, and boolean');
    });

    it('rejects too many values', () => {
      const manyValues: Record<string, string> = {};
      for (let i = 0; i < 51; i++) {
        manyValues[`key${i}`] = `value${i}`;
      }
      expect(() => validateHelmValues(manyValues)).toThrow('Too many Helm values');
    });

    it('accepts exactly 50 values', () => {
      const values: Record<string, string> = {};
      for (let i = 0; i < 50; i++) {
        values[`key${i}`] = `value${i}`;
      }
      expect(() => validateHelmValues(values)).not.toThrow();
    });
  });

  describe('sanitizeHelmError', () => {
    it('redacts kubeconfig paths', () => {
      const result = sanitizeHelmError('error: --kubeconfig /tmp/helm-abc/kubeconfig failed');
      expect(result).toContain('--kubeconfig [REDACTED]');
      expect(result).not.toContain('/tmp/helm-abc');
    });

    it('redacts kube-token values', () => {
      const result = sanitizeHelmError('error: --kube-token eyJhbGciOiJSUzI1NiIs failed');
      expect(result).toContain('--kube-token [REDACTED]');
      expect(result).not.toContain('eyJhbGciOiJSUzI1NiIs');
    });

    it('redacts token values in kubeconfig format', () => {
      const result = sanitizeHelmError('token: "secret-bearer-token"');
      expect(result).toContain('token: "[REDACTED]"');
      expect(result).not.toContain('secret-bearer-token');
    });

    it('redacts API server IPs', () => {
      const result = sanitizeHelmError('dial tcp https://10.0.0.1:6443 connection refused');
      expect(result).toContain('[api-server]');
      expect(result).not.toContain('10.0.0.1');
    });

    it('redacts service account references', () => {
      const result = sanitizeHelmError(
        'system:serviceaccount:default:my-sa is forbidden',
      );
      expect(result).toContain('[service-account]');
      expect(result).not.toContain('system:serviceaccount');
    });
  });

  describe('helmInstall', () => {
    it('calls execFile with correct install arguments', async () => {
      mockHelmSuccess('{"name":"my-qs"}');

      await helmInstall('my-qs', 'oci://quay.io/org/chart', 'test-ns', 'my-token');

      expect(mockedExecFile).toHaveBeenCalledTimes(1);
      const args = mockedExecFile.mock.calls[0][1] as string[];
      expect(args).toContain('install');
      expect(args).toContain('my-qs');
      expect(args).toContain('oci://quay.io/org/chart');
      expect(args).toContain('--namespace');
      expect(args).toContain('test-ns');
      expect(args).toContain('--create-namespace');
      expect(args).toContain('--wait');
      expect(args).toContain('--output');
      expect(args).toContain('json');
      expect(args).toContain('--kubeconfig');
      expect(args).toContain('--kube-apiserver');
    });

    it('passes --version when version is provided', async () => {
      mockHelmSuccess('{}');

      await helmInstall('my-qs', 'oci://quay.io/org/chart', 'ns', 'token', undefined, '2.0.0');

      const args = mockedExecFile.mock.calls[0][1] as string[];
      const versionIdx = args.indexOf('--version');
      expect(versionIdx).toBeGreaterThan(-1);
      expect(args[versionIdx + 1]).toBe('2.0.0');
    });

    it('passes --set flags for values', async () => {
      mockHelmSuccess('{}');

      await helmInstall('my-qs', 'chart', 'ns', 'token', {
        'image.tag': '1.0.0',
        replicas: 3,
      });

      const args = mockedExecFile.mock.calls[0][1] as string[];
      const setIndices = args.reduce<number[]>((acc, arg, i) => {
        if (arg === '--set') acc.push(i);
        return acc;
      }, []);
      expect(setIndices).toHaveLength(2);
      expect(args[setIndices[0] + 1]).toBe('image.tag=1.0.0');
      expect(args[setIndices[1] + 1]).toBe('replicas=3');
    });

    it('rejects invalid values before calling helm', async () => {
      await expect(
        helmInstall('my-qs', 'chart', 'ns', 'token', { 'bad key!': 'val' }),
      ).rejects.toThrow('Invalid Helm value key');
      expect(mockedExecFile).not.toHaveBeenCalled();
    });

    it('cleans up temp directory on success', async () => {
      mockHelmSuccess('{}');

      await helmInstall('my-qs', 'chart', 'ns', 'token');

      expect(fs.rmSync).toHaveBeenCalledWith('/tmp/helm-abc123', {
        recursive: true,
        force: true,
      });
    });

    it('cleans up temp directory on failure', async () => {
      mockHelmFailure('install failed');

      await expect(helmInstall('my-qs', 'chart', 'ns', 'token')).rejects.toThrow();
      expect(fs.rmSync).toHaveBeenCalledWith('/tmp/helm-abc123', {
        recursive: true,
        force: true,
      });
    });

    it('sanitizes error messages', async () => {
      mockHelmFailure('error with --kubeconfig /tmp/helm-abc123/kubeconfig');

      await expect(helmInstall('my-qs', 'chart', 'ns', 'token')).rejects.toThrow(
        '--kubeconfig [REDACTED]',
      );
    });
  });

  describe('helmUpgrade', () => {
    it('calls execFile with upgrade arguments without --create-namespace', async () => {
      mockHelmSuccess('{}');

      await helmUpgrade('my-qs', 'chart', 'ns', 'token');

      const args = mockedExecFile.mock.calls[0][1] as string[];
      expect(args).toContain('upgrade');
      expect(args).not.toContain('--create-namespace');
    });
  });

  describe('helmUninstall', () => {
    it('calls execFile with uninstall arguments', async () => {
      mockHelmSuccess('release "my-qs" uninstalled');

      await helmUninstall('my-qs', 'ns', 'token');

      const args = mockedExecFile.mock.calls[0][1] as string[];
      expect(args).toContain('uninstall');
      expect(args).toContain('my-qs');
      expect(args).toContain('--namespace');
      expect(args).toContain('ns');
    });
  });

  describe('helmList', () => {
    it('parses JSON output into HelmRelease array', async () => {
      const releases: HelmRelease[] = [
        { name: 'my-qs', namespace: 'ns', status: 'deployed', chart: 'lemonade-1.0.0', app_version: '1.0.0' },
      ];
      mockHelmSuccess(JSON.stringify(releases));

      const result = await helmList('ns', 'token');

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('my-qs');
      expect(result[0].status).toBe('deployed');
    });

    it('returns empty array for empty output', async () => {
      mockHelmSuccess('');

      const result = await helmList('ns', 'token');
      expect(result).toEqual([]);
    });

    it('returns empty array for whitespace-only output', async () => {
      mockHelmSuccess('  \n  ');

      const result = await helmList('ns', 'token');
      expect(result).toEqual([]);
    });
  });

  describe('kubeconfig isolation', () => {
    it('writes kubeconfig with restricted permissions', async () => {
      mockHelmSuccess('{}');

      await helmInstall('my-qs', 'chart', 'ns', 'token');

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        '/tmp/helm-abc123/kubeconfig',
        expect.any(String),
        { mode: 0o600 },
      );
    });

    it('isolates Helm cache/config/data directories', async () => {
      mockHelmSuccess('{}');

      await helmInstall('my-qs', 'chart', 'ns', 'token');

      const opts = mockedExecFile.mock.calls[0][2] as { env: Record<string, string> };
      expect(opts.env.HELM_CACHE_HOME).toBe('/tmp/helm-abc123/cache');
      expect(opts.env.HELM_CONFIG_HOME).toBe('/tmp/helm-abc123/config');
      expect(opts.env.HELM_DATA_HOME).toBe('/tmp/helm-abc123/data');
    });

    it('uses execFile not exec to prevent shell injection', async () => {
      mockHelmSuccess('{}');

      await helmInstall('my-qs', 'chart', 'ns', 'token');

      expect(mockedExecFile).toHaveBeenCalled();
    });
  });
});
