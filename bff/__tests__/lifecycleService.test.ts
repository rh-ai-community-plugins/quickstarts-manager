import { installQuickstart, upgradeQuickstart, removeQuickstart } from '../src/services/lifecycleService';
import * as helmService from '../src/services/helmService';
import * as k8sApiClient from '../src/services/k8sApiClient';
import * as registryClient from '../src/services/registryClient';
import * as metadataClient from '../src/services/quickstartMetadataClient';
import * as rbacChecker from '../src/services/rbacChecker';
import * as settingsService from '../src/services/settingsService';
import * as proxyAgent from '../src/utils/proxyAgent';
import * as githubChart from '../src/utils/githubChart';
import { QuickstartMetadata } from '../src/types/catalog';
import { LifecycleStep } from '../src/types/lifecycle';

jest.mock('../src/services/helmService', () => {
  const actual = jest.requireActual('../src/services/helmService');
  return {
    ...actual,
    helmInstall: jest.fn(),
    helmUpgrade: jest.fn(),
    helmUninstall: jest.fn(),
    helmList: jest.fn(),
  };
});
jest.mock('../src/services/k8sApiClient');
jest.mock('../src/services/registryClient');
jest.mock('../src/services/quickstartMetadataClient');
jest.mock('../src/services/rbacChecker');
jest.mock('../src/services/settingsService');
jest.mock('../src/utils/proxyAgent');
jest.mock('../src/utils/githubChart');

const mockedHelmInstall = jest.mocked(helmService.helmInstall);
const mockedHelmUpgrade = jest.mocked(helmService.helmUpgrade);
const mockedHelmUninstall = jest.mocked(helmService.helmUninstall);
const mockedHelmList = jest.mocked(helmService.helmList);
const mockedDiscoverRoutes = jest.mocked(k8sApiClient.discoverRoutes);
const mockedGetRegistryQuickstarts = jest.mocked(registryClient.getRegistryQuickstarts);
const mockedGetQuickstartMetadata = jest.mocked(metadataClient.getQuickstartMetadata);
const mockedCheckRbacPermissions = jest.mocked(rbacChecker.checkRbacPermissions);
const mockedGetSettings = jest.mocked(settingsService.getSettings);
const mockedGetProxyAgent = jest.mocked(proxyAgent.getProxyAgent);
const mockedDownloadRepoChart = jest.mocked(githubChart.downloadRepoChart);
const mockedCleanupExtractedChart = jest.mocked(githubChart.cleanupExtractedChart);

const MOCK_METADATA: QuickstartMetadata = {
  name: 'lemonade',
  displayName: 'Lemonade Stand Assistant',
  description: 'An AI-powered lemonade stand assistant',
  version: '1.0.0',
  maintainer: { name: 'Test User', github: 'testuser' },
  repository: 'https://github.com/rh-ai-quickstart/lemonade-stand-assistant',
  deployment: {
    scope: 'project',
    chart: { type: 'oci', ref: 'oci://quay.io/rh-ai-quickstart/lemonade-chart' },
    defaultValues: { 'app.debug': false },
  },
  rbac: {
    requiredPermissions: [
      { apiGroup: '', resource: 'pods', verbs: ['get', 'list', 'create'] },
      { apiGroup: 'apps', resource: 'deployments', verbs: ['create', 'delete'] },
    ],
  },
  tags: ['chatbot', 'llm'],
};

const MOCK_REPO_METADATA: QuickstartMetadata = {
  ...MOCK_METADATA,
  deployment: {
    ...MOCK_METADATA.deployment,
    chart: { type: 'repo' as const, path: 'chart/' },
  },
};

function setupRegistryMock(name = 'lemonade') {
  mockedGetRegistryQuickstarts.mockResolvedValue([
    { name, repository: `https://github.com/rh-ai-quickstart/${name}` },
  ]);
}

describe('lifecycleService', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    setupRegistryMock();
    mockedGetQuickstartMetadata.mockResolvedValue(MOCK_METADATA);
    mockedCheckRbacPermissions.mockResolvedValue({ allowed: true, granted: [], denied: [] });
    mockedHelmList.mockResolvedValue([]);
    mockedHelmInstall.mockResolvedValue('{}');
    mockedHelmUpgrade.mockResolvedValue('{}');
    mockedHelmUninstall.mockResolvedValue('released');
    mockedDiscoverRoutes.mockResolvedValue([]);
    mockedGetSettings.mockReturnValue({ githubToken: null, proxyUrl: null, source: 'default' });
    mockedGetProxyAgent.mockReturnValue(undefined);
    mockedDownloadRepoChart.mockResolvedValue({ chartPath: '/tmp/qs-chart-test/extracted/org-repo-abc123/chart', tmpDir: '/tmp/qs-chart-test' });
    mockedCleanupExtractedChart.mockImplementation(() => {});
  });

  describe('installQuickstart', () => {
    it('completes the full install flow successfully', async () => {
      mockedDiscoverRoutes.mockResolvedValue([
        { name: 'frontend', host: 'fe.example.com', path: '/', url: 'https://fe.example.com/', tlsEnabled: true },
      ]);

      const result = await installQuickstart('lemonade', 'test-ns', 'token');

      expect(result.success).toBe(true);
      expect(result.message).toContain('installed successfully');
      expect(result.routes).toHaveLength(1);
      expect(result.routes![0].url).toBe('https://fe.example.com/');
      expect(result.steps.every((s) => s.status === 'completed')).toBe(true);
    });

    it('calls progress callback at each step', async () => {
      const snapshots: LifecycleStep[][] = [];
      const onProgress = (steps: LifecycleStep[]) => {
        snapshots.push(steps.map((s) => ({ ...s })));
      };

      await installQuickstart('lemonade', 'test-ns', 'token', undefined, onProgress);

      expect(snapshots.length).toBeGreaterThan(0);
      const runningSteps = snapshots
        .flat()
        .filter((s) => s.status === 'running')
        .map((s) => s.id);
      expect(runningSteps).toContain('resolve');
      expect(runningSteps).toContain('check-existing');
      expect(runningSteps).toContain('rbac-check');
      expect(runningSteps).toContain('helm-install');
      expect(runningSteps).toContain('discover-routes');
    });

    it('installs with OCI chart reference', async () => {
      await installQuickstart('lemonade', 'test-ns', 'token');

      expect(mockedHelmInstall).toHaveBeenCalledWith(
        'lemonade',
        'oci://quay.io/rh-ai-quickstart/lemonade-chart',
        'test-ns',
        'token',
        { 'app.debug': false },
        '1.0.0',
      );
    });

    it('merges user values with defaultValues', async () => {
      await installQuickstart('lemonade', 'test-ns', 'token', { 'app.debug': true, replicas: 3 });

      expect(mockedHelmInstall).toHaveBeenCalledWith(
        'lemonade',
        'oci://quay.io/rh-ai-quickstart/lemonade-chart',
        'test-ns',
        'token',
        { 'app.debug': true, replicas: 3 },
        '1.0.0',
      );
    });

    it('blocks install when namespace already has a release', async () => {
      mockedHelmList.mockResolvedValue([
        { name: 'existing', namespace: 'test-ns', status: 'deployed', chart: 'chart-1.0', app_version: '1.0' },
      ]);

      const result = await installQuickstart('lemonade', 'test-ns', 'token');

      expect(result.success).toBe(false);
      expect(result.message).toContain('already has a deployed quickstart');
      expect(mockedHelmInstall).not.toHaveBeenCalled();
    });

    it('blocks install when RBAC check fails', async () => {
      mockedCheckRbacPermissions.mockResolvedValue({
        allowed: false,
        granted: [],
        denied: [{ apiGroup: 'apps', resource: 'deployments', verb: 'create' }],
      });

      const result = await installQuickstart('lemonade', 'test-ns', 'token');

      expect(result.success).toBe(false);
      expect(result.message).toContain('Insufficient permissions');
      expect(result.message).toContain('create deployments');
      expect(mockedHelmInstall).not.toHaveBeenCalled();
    });

    it('skips RBAC check when no permissions are declared', async () => {
      const metadataNoRbac = { ...MOCK_METADATA, rbac: undefined };
      mockedGetQuickstartMetadata.mockResolvedValue(metadataNoRbac);

      const result = await installQuickstart('lemonade', 'test-ns', 'token');

      expect(result.success).toBe(true);
      expect(mockedCheckRbacPermissions).not.toHaveBeenCalled();
    });

    it('fails when quickstart is not in registry', async () => {
      mockedGetRegistryQuickstarts.mockResolvedValue([]);

      const result = await installQuickstart('unknown', 'test-ns', 'token');

      expect(result.success).toBe(false);
      expect(result.message).toContain('not found in registry');
    });

    it('fails when metadata is unavailable', async () => {
      mockedGetQuickstartMetadata.mockResolvedValue(null);

      const result = await installQuickstart('lemonade', 'test-ns', 'token');

      expect(result.success).toBe(false);
      expect(result.message).toContain('Metadata unavailable');
    });

    it('installs with repo chart type', async () => {
      mockedGetQuickstartMetadata.mockResolvedValue(MOCK_REPO_METADATA);

      const result = await installQuickstart('lemonade', 'test-ns', 'token');

      expect(result.success).toBe(true);
      expect(mockedDownloadRepoChart).toHaveBeenCalledWith(
        'https://github.com/rh-ai-quickstart/lemonade',
        'chart/',
        'main',
        expect.objectContaining({ token: undefined }),
      );
      expect(mockedHelmInstall).toHaveBeenCalledWith(
        'lemonade',
        '/tmp/qs-chart-test/extracted/org-repo-abc123/chart',
        'test-ns',
        'token',
        { 'app.debug': false },
        undefined,
      );
      expect(mockedCleanupExtractedChart).toHaveBeenCalledWith('/tmp/qs-chart-test');
    });

    it('cleans up repo chart temp dir on helm failure', async () => {
      mockedGetQuickstartMetadata.mockResolvedValue(MOCK_REPO_METADATA);
      mockedHelmInstall.mockRejectedValue(new Error('helm install failed'));

      const result = await installQuickstart('lemonade', 'test-ns', 'token');

      expect(result.success).toBe(false);
      expect(mockedCleanupExtractedChart).toHaveBeenCalledWith('/tmp/qs-chart-test');
    });

    it('passes github token to repo chart download', async () => {
      mockedGetQuickstartMetadata.mockResolvedValue(MOCK_REPO_METADATA);
      mockedGetSettings.mockReturnValue({ githubToken: 'gh-token-123', proxyUrl: null, source: 'secret' });

      await installQuickstart('lemonade', 'test-ns', 'token');

      expect(mockedDownloadRepoChart).toHaveBeenCalledWith(
        expect.any(String),
        'chart/',
        'main',
        expect.objectContaining({ token: 'gh-token-123' }),
      );
    });

    it('uses chart.branch over registry.branch for repo charts', async () => {
      const metadataWithBranch = {
        ...MOCK_REPO_METADATA,
        deployment: {
          ...MOCK_REPO_METADATA.deployment,
          chart: { type: 'repo' as const, path: 'chart/', branch: 'release-v2' },
        },
      };
      mockedGetQuickstartMetadata.mockResolvedValue(metadataWithBranch);
      mockedGetRegistryQuickstarts.mockResolvedValue([
        { name: 'lemonade', repository: 'https://github.com/rh-ai-quickstart/lemonade', branch: 'dev' },
      ]);

      await installQuickstart('lemonade', 'test-ns', 'token');

      expect(mockedDownloadRepoChart).toHaveBeenCalledWith(
        expect.any(String),
        'chart/',
        'release-v2',
        expect.any(Object),
      );
    });

    it('falls back to registry.branch for repo charts without chart.branch', async () => {
      mockedGetQuickstartMetadata.mockResolvedValue(MOCK_REPO_METADATA);
      mockedGetRegistryQuickstarts.mockResolvedValue([
        { name: 'lemonade', repository: 'https://github.com/rh-ai-quickstart/lemonade', branch: 'dev' },
      ]);

      await installQuickstart('lemonade', 'test-ns', 'token');

      expect(mockedDownloadRepoChart).toHaveBeenCalledWith(
        expect.any(String),
        'chart/',
        'dev',
        expect.any(Object),
      );
    });

    it('rejects invalid OCI chart reference format', async () => {
      const badOciMetadata = {
        ...MOCK_METADATA,
        deployment: {
          ...MOCK_METADATA.deployment,
          chart: { type: 'oci' as const, ref: 'not-a-valid-oci-ref' },
        },
      };
      mockedGetQuickstartMetadata.mockResolvedValue(badOciMetadata);

      const result = await installQuickstart('lemonade', 'test-ns', 'token');

      expect(result.success).toBe(false);
      expect(result.message).toContain('Invalid OCI chart reference');
    });

    it('fails when deployment.chart is missing', async () => {
      const noChartMetadata = {
        ...MOCK_METADATA,
        deployment: { scope: 'project' as const },
      } as unknown as QuickstartMetadata;
      mockedGetQuickstartMetadata.mockResolvedValue(noChartMetadata);

      const result = await installQuickstart('lemonade', 'test-ns', 'token');

      expect(result.success).toBe(false);
      expect(result.message).toContain('no chart configuration');
    });

    it('marks the correct step as failed on error', async () => {
      mockedHelmInstall.mockRejectedValue(new Error('helm install failed'));

      const result = await installQuickstart('lemonade', 'test-ns', 'token');

      expect(result.success).toBe(false);
      const failedStep = result.steps.find((s) => s.status === 'failed');
      expect(failedStep).toBeDefined();
      expect(failedStep!.id).toBe('helm-install');
      expect(failedStep!.error).toContain('helm install failed');
    });

    it('sanitizes error messages to prevent token leakage', async () => {
      mockedHelmInstall.mockRejectedValue(
        new Error('error: --kubeconfig /tmp/helm-abc/kubeconfig failed'),
      );

      const result = await installQuickstart('lemonade', 'test-ns', 'token');

      expect(result.message).not.toContain('/tmp/helm-abc');
      expect(result.message).toContain('[REDACTED]');
    });
  });

  describe('upgradeQuickstart', () => {
    beforeEach(() => {
      mockedHelmList.mockResolvedValue([
        { name: 'lemonade', namespace: 'test-ns', status: 'deployed', chart: 'lemonade-0.9.0', app_version: '0.9.0' },
      ]);
    });

    it('completes the upgrade flow successfully', async () => {
      const result = await upgradeQuickstart('lemonade', 'test-ns', 'token');

      expect(result.success).toBe(true);
      expect(result.message).toContain('upgraded successfully');
      expect(result.steps.every((s) => s.status === 'completed')).toBe(true);
    });

    it('calls helmUpgrade with correct arguments', async () => {
      await upgradeQuickstart('lemonade', 'test-ns', 'token');

      expect(mockedHelmUpgrade).toHaveBeenCalledWith(
        'lemonade',
        'oci://quay.io/rh-ai-quickstart/lemonade-chart',
        'test-ns',
        'token',
        { 'app.debug': false },
        '1.0.0',
      );
    });

    it('merges user values with defaultValues', async () => {
      await upgradeQuickstart('lemonade', 'test-ns', 'token', { replicas: 5 });

      expect(mockedHelmUpgrade).toHaveBeenCalledWith(
        'lemonade',
        'oci://quay.io/rh-ai-quickstart/lemonade-chart',
        'test-ns',
        'token',
        { 'app.debug': false, replicas: 5 },
        '1.0.0',
      );
    });

    it('fails when no existing release is found', async () => {
      mockedHelmList.mockResolvedValue([]);

      const result = await upgradeQuickstart('lemonade', 'test-ns', 'token');

      expect(result.success).toBe(false);
      expect(result.message).toContain('No release');
      expect(mockedHelmUpgrade).not.toHaveBeenCalled();
    });

    it('fails when release name does not match', async () => {
      mockedHelmList.mockResolvedValue([
        { name: 'other-qs', namespace: 'test-ns', status: 'deployed', chart: 'other-1.0', app_version: '1.0' },
      ]);

      const result = await upgradeQuickstart('lemonade', 'test-ns', 'token');

      expect(result.success).toBe(false);
      expect(result.message).toContain('No release "lemonade"');
    });

    it('calls progress callback', async () => {
      const onProgress = jest.fn();

      await upgradeQuickstart('lemonade', 'test-ns', 'token', undefined, onProgress);

      expect(onProgress).toHaveBeenCalled();
    });

    it('marks the correct step as failed on error', async () => {
      mockedHelmUpgrade.mockRejectedValue(new Error('upgrade failed'));

      const result = await upgradeQuickstart('lemonade', 'test-ns', 'token');

      const failedStep = result.steps.find((s) => s.status === 'failed');
      expect(failedStep).toBeDefined();
      expect(failedStep!.id).toBe('helm-upgrade');
    });

    it('blocks upgrade when RBAC check fails', async () => {
      mockedCheckRbacPermissions.mockResolvedValue({
        allowed: false,
        granted: [],
        denied: [{ apiGroup: 'apps', resource: 'deployments', verb: 'create' }],
      });

      const result = await upgradeQuickstart('lemonade', 'test-ns', 'token');

      expect(result.success).toBe(false);
      expect(result.message).toContain('Insufficient permissions');
      expect(mockedHelmUpgrade).not.toHaveBeenCalled();
    });

    it('skips RBAC check when no permissions are declared', async () => {
      const metadataNoRbac = { ...MOCK_METADATA, rbac: undefined };
      mockedGetQuickstartMetadata.mockResolvedValue(metadataNoRbac);

      const result = await upgradeQuickstart('lemonade', 'test-ns', 'token');

      expect(result.success).toBe(true);
      expect(mockedCheckRbacPermissions).not.toHaveBeenCalled();
    });

    it('upgrades with repo chart type', async () => {
      mockedGetQuickstartMetadata.mockResolvedValue(MOCK_REPO_METADATA);

      const result = await upgradeQuickstart('lemonade', 'test-ns', 'token');

      expect(result.success).toBe(true);
      expect(mockedDownloadRepoChart).toHaveBeenCalled();
      expect(mockedHelmUpgrade).toHaveBeenCalledWith(
        'lemonade',
        '/tmp/qs-chart-test/extracted/org-repo-abc123/chart',
        'test-ns',
        'token',
        { 'app.debug': false },
        undefined,
      );
      expect(mockedCleanupExtractedChart).toHaveBeenCalledWith('/tmp/qs-chart-test');
    });

    it('cleans up repo chart temp dir on upgrade failure', async () => {
      mockedGetQuickstartMetadata.mockResolvedValue(MOCK_REPO_METADATA);
      mockedHelmUpgrade.mockRejectedValue(new Error('upgrade failed'));

      const result = await upgradeQuickstart('lemonade', 'test-ns', 'token');

      expect(result.success).toBe(false);
      expect(mockedCleanupExtractedChart).toHaveBeenCalledWith('/tmp/qs-chart-test');
    });
  });

  describe('removeQuickstart', () => {
    beforeEach(() => {
      mockedHelmList.mockResolvedValue([
        { name: 'lemonade', namespace: 'test-ns', status: 'deployed', chart: 'lemonade-1.0.0', app_version: '1.0.0' },
      ]);
    });

    it('completes the remove flow successfully', async () => {
      const result = await removeQuickstart('lemonade', 'test-ns', 'token');

      expect(result.success).toBe(true);
      expect(result.message).toContain('removed');
      expect(result.steps.every((s) => s.status === 'completed')).toBe(true);
    });

    it('calls helmUninstall with correct arguments', async () => {
      await removeQuickstart('lemonade', 'test-ns', 'token');

      expect(mockedHelmUninstall).toHaveBeenCalledWith('lemonade', 'test-ns', 'token');
    });

    it('fails when no existing release is found', async () => {
      mockedHelmList.mockResolvedValue([]);

      const result = await removeQuickstart('lemonade', 'test-ns', 'token');

      expect(result.success).toBe(false);
      expect(result.message).toContain('No release');
      expect(mockedHelmUninstall).not.toHaveBeenCalled();
    });

    it('calls progress callback', async () => {
      const onProgress = jest.fn();

      await removeQuickstart('lemonade', 'test-ns', 'token', onProgress);

      expect(onProgress).toHaveBeenCalled();
    });

    it('marks the correct step as failed on error', async () => {
      mockedHelmUninstall.mockRejectedValue(new Error('uninstall failed'));

      const result = await removeQuickstart('lemonade', 'test-ns', 'token');

      const failedStep = result.steps.find((s) => s.status === 'failed');
      expect(failedStep).toBeDefined();
      expect(failedStep!.id).toBe('helm-uninstall');
    });
  });

  describe('namespace locking', () => {
    it('serializes concurrent installs to the same namespace', async () => {
      const callOrder: string[] = [];
      mockedHelmInstall.mockImplementation(async () => {
        callOrder.push('install-start');
        await new Promise((r) => setTimeout(r, 50));
        callOrder.push('install-end');
        return '{}';
      });

      const p1 = installQuickstart('lemonade', 'test-ns', 'token');
      const p2 = installQuickstart('lemonade', 'test-ns', 'token2');

      await Promise.all([p1, p2]);

      expect(callOrder).toEqual([
        'install-start', 'install-end',
        'install-start', 'install-end',
      ]);
    });

    it('allows concurrent installs to different namespaces', async () => {
      const callOrder: string[] = [];
      mockedHelmInstall.mockImplementation(async (_name, _ref, ns) => {
        callOrder.push(`start-${ns}`);
        await new Promise((r) => setTimeout(r, 50));
        callOrder.push(`end-${ns}`);
        return '{}';
      });

      const p1 = installQuickstart('lemonade', 'ns-a', 'token');
      const p2 = installQuickstart('lemonade', 'ns-b', 'token');

      await Promise.all([p1, p2]);

      expect(callOrder[0]).toBe('start-ns-a');
      expect(callOrder[1]).toBe('start-ns-b');
    });
  });
});
