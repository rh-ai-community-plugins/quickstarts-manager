import { helmInstall, helmUpgrade, helmUninstall, helmList, sanitizeHelmError } from './helmService';
import { discoverRoutes } from './k8sApiClient';
import { getRegistryQuickstarts } from './registryClient';
import { getQuickstartMetadata } from './quickstartMetadataClient';
import { checkRbacPermissions } from './rbacChecker';
import { getSettings } from './settingsService';
import { getProxyAgent } from '../utils/proxyAgent';
import { downloadRepoChart, cleanupExtractedChart } from '../utils/githubChart';
import { QuickstartMetadata, RegistryQuickstart } from '../types/catalog';
import { LifecycleStep, LifecycleResponse, LifecycleProgressCallback } from '../types/lifecycle';

function sanitizeErrorMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  return sanitizeHelmError(raw);
}

function createStep(id: string, label: string): LifecycleStep {
  return { id, label, status: 'pending' };
}

function markRunning(step: LifecycleStep): void {
  step.status = 'running';
}

function markCompleted(step: LifecycleStep): void {
  step.status = 'completed';
}

function markFailed(step: LifecycleStep, error: string): void {
  step.status = 'failed';
  step.error = error;
}

async function resolveQuickstart(name: string): Promise<{
  registry: RegistryQuickstart;
  metadata: QuickstartMetadata;
}> {
  const registryQuickstarts = await getRegistryQuickstarts();
  const registry = registryQuickstarts.find((qs) => qs.name === name);
  if (!registry) {
    throw new Error(`Quickstart "${name}" not found in registry`);
  }

  const metadata = await getQuickstartMetadata(registry);
  if (!metadata) {
    throw new Error(`Metadata unavailable for quickstart "${name}"`);
  }

  if (!metadata.deployment?.chart) {
    throw new Error(`Quickstart "${name}" has no chart configuration`);
  }

  return { registry, metadata };
}

const OCI_REF_PATTERN = /^oci:\/\/[a-zA-Z0-9._-]+(\/[a-zA-Z0-9._-]+)+$/;

interface ResolvedChartOci {
  type: 'oci';
  ref: string;
  version: string;
}

interface ResolvedChartRepo {
  type: 'repo';
  ref: string;
  version?: undefined;
  tmpDir: string;
}

type ResolvedChart = ResolvedChartOci | ResolvedChartRepo;

async function resolveChart(
  metadata: QuickstartMetadata,
  registry: RegistryQuickstart,
): Promise<ResolvedChart> {
  const chart = metadata.deployment.chart;

  if (chart.type === 'oci') {
    if (!OCI_REF_PATTERN.test(chart.ref)) {
      throw new Error(`Invalid OCI chart reference format: "${chart.ref}"`);
    }
    return { type: 'oci', ref: chart.ref, version: metadata.version };
  }

  const branch = chart.branch ?? registry.branch ?? 'main';

  const { githubToken } = getSettings();
  const agent = getProxyAgent();

  const extracted = await downloadRepoChart(
    registry.repository,
    chart.path,
    branch,
    { token: githubToken ?? undefined, agent: agent ?? undefined },
  );

  return { type: 'repo', ref: extracted.chartPath, tmpDir: extracted.tmpDir };
}

export async function installQuickstart(
  quickstartName: string,
  namespace: string,
  token: string,
  values?: Record<string, unknown>,
  onProgress?: LifecycleProgressCallback,
): Promise<LifecycleResponse> {
  const steps: LifecycleStep[] = [
    createStep('resolve', 'Resolve quickstart metadata'),
    createStep('check-existing', 'Check for existing deployment'),
    createStep('rbac-check', 'Verify RBAC permissions'),
    createStep('helm-install', 'Install Helm chart'),
    createStep('discover-routes', 'Discover application routes'),
  ];
  onProgress?.(steps);

  let metadata: QuickstartMetadata | undefined;
  let registry: RegistryQuickstart | undefined;
  try {
    markRunning(steps[0]);
    onProgress?.(steps);
    const quickstart = await resolveQuickstart(quickstartName);
    metadata = quickstart.metadata;
    registry = quickstart.registry;
    markCompleted(steps[0]);
    onProgress?.(steps);

    markRunning(steps[1]);
    onProgress?.(steps);
    const existingReleases = await helmList(namespace, token);
    if (existingReleases.length > 0) {
      throw new Error(
        `Namespace "${namespace}" already has a deployed quickstart ` +
        `("${existingReleases[0].name}"). Only one quickstart per namespace is allowed.`,
      );
    }
    markCompleted(steps[1]);
    onProgress?.(steps);

    markRunning(steps[2]);
    onProgress?.(steps);
    const requiredPermissions = metadata.rbac?.requiredPermissions;
    if (requiredPermissions && requiredPermissions.length > 0) {
      const rbacResult = await checkRbacPermissions(token, namespace, requiredPermissions);
      if (!rbacResult.allowed) {
        const deniedSummary = rbacResult.denied
          .map((d) => `${d.verb} ${d.resource}${d.apiGroup ? ' (' + d.apiGroup + ')' : ''}`)
          .join(', ');
        throw new Error(`Insufficient permissions in namespace "${namespace}": missing ${deniedSummary}`);
      }
    }
    markCompleted(steps[2]);
    onProgress?.(steps);

    markRunning(steps[3]);
    onProgress?.(steps);
    const resolved = await resolveChart(metadata, registry);
    try {
      const mergedValues = { ...metadata.deployment.defaultValues, ...values };
      const helmValues = Object.keys(mergedValues).length > 0 ? mergedValues : undefined;
      await helmInstall(quickstartName, resolved.ref, namespace, token, helmValues, resolved.version);
    } finally {
      if (resolved.type === 'repo') {
        cleanupExtractedChart(resolved.tmpDir);
      }
    }
    markCompleted(steps[3]);
    onProgress?.(steps);

    markRunning(steps[4]);
    onProgress?.(steps);
    const routes = await discoverRoutes(namespace, token);
    markCompleted(steps[4]);
    onProgress?.(steps);

    return {
      success: true,
      message: `Quickstart "${quickstartName}" installed successfully in namespace "${namespace}"`,
      steps,
      routes: routes.map((r) => ({ name: r.name, url: r.url })),
    };
  } catch (err) {
    const failedStep = steps.find((s) => s.status === 'running');
    if (failedStep) {
      markFailed(failedStep, sanitizeErrorMessage(err));
      onProgress?.(steps);
    }

    return {
      success: false,
      message: `Failed to install quickstart "${quickstartName}": ${sanitizeErrorMessage(err)}`,
      steps,
    };
  }
}

export async function upgradeQuickstart(
  quickstartName: string,
  namespace: string,
  token: string,
  values?: Record<string, unknown>,
  onProgress?: LifecycleProgressCallback,
): Promise<LifecycleResponse> {
  const steps: LifecycleStep[] = [
    createStep('resolve', 'Resolve quickstart metadata'),
    createStep('check-release', 'Verify existing release'),
    createStep('rbac-check', 'Verify RBAC permissions'),
    createStep('helm-upgrade', 'Upgrade Helm release'),
  ];
  onProgress?.(steps);

  try {
    markRunning(steps[0]);
    onProgress?.(steps);
    const { metadata, registry } = await resolveQuickstart(quickstartName);
    markCompleted(steps[0]);
    onProgress?.(steps);

    markRunning(steps[1]);
    onProgress?.(steps);
    const existingReleases = await helmList(namespace, token);
    const release = existingReleases.find((r) => r.name === quickstartName);
    if (!release) {
      throw new Error(`No release "${quickstartName}" found in namespace "${namespace}"`);
    }
    markCompleted(steps[1]);
    onProgress?.(steps);

    markRunning(steps[2]);
    onProgress?.(steps);
    const requiredPermissions = metadata.rbac?.requiredPermissions;
    if (requiredPermissions && requiredPermissions.length > 0) {
      const rbacResult = await checkRbacPermissions(token, namespace, requiredPermissions);
      if (!rbacResult.allowed) {
        const deniedSummary = rbacResult.denied
          .map((d) => `${d.verb} ${d.resource}${d.apiGroup ? ' (' + d.apiGroup + ')' : ''}`)
          .join(', ');
        throw new Error(`Insufficient permissions in namespace "${namespace}": missing ${deniedSummary}`);
      }
    }
    markCompleted(steps[2]);
    onProgress?.(steps);

    markRunning(steps[3]);
    onProgress?.(steps);
    const resolved = await resolveChart(metadata, registry);
    try {
      const mergedValues = { ...metadata.deployment.defaultValues, ...values };
      const helmValues = Object.keys(mergedValues).length > 0 ? mergedValues : undefined;
      await helmUpgrade(quickstartName, resolved.ref, namespace, token, helmValues, resolved.version);
    } finally {
      if (resolved.type === 'repo') {
        cleanupExtractedChart(resolved.tmpDir);
      }
    }
    markCompleted(steps[3]);
    onProgress?.(steps);

    return {
      success: true,
      message: `Quickstart "${quickstartName}" upgraded successfully in namespace "${namespace}"`,
      steps,
    };
  } catch (err) {
    const failedStep = steps.find((s) => s.status === 'running');
    if (failedStep) {
      markFailed(failedStep, sanitizeErrorMessage(err));
      onProgress?.(steps);
    }
    return {
      success: false,
      message: `Failed to upgrade quickstart "${quickstartName}": ${sanitizeErrorMessage(err)}`,
      steps,
    };
  }
}

export async function removeQuickstart(
  quickstartName: string,
  namespace: string,
  token: string,
  onProgress?: LifecycleProgressCallback,
): Promise<LifecycleResponse> {
  const steps: LifecycleStep[] = [
    createStep('check-release', 'Verify existing release'),
    createStep('helm-uninstall', 'Uninstall Helm release'),
  ];
  onProgress?.(steps);

  try {
    markRunning(steps[0]);
    onProgress?.(steps);
    const existingReleases = await helmList(namespace, token);
    const release = existingReleases.find((r) => r.name === quickstartName);
    if (!release) {
      throw new Error(`No release "${quickstartName}" found in namespace "${namespace}"`);
    }
    markCompleted(steps[0]);
    onProgress?.(steps);

    markRunning(steps[1]);
    onProgress?.(steps);
    await helmUninstall(quickstartName, namespace, token);
    markCompleted(steps[1]);
    onProgress?.(steps);

    return {
      success: true,
      message: `Quickstart "${quickstartName}" removed from namespace "${namespace}"`,
      steps,
    };
  } catch (err) {
    const failedStep = steps.find((s) => s.status === 'running');
    if (failedStep) {
      markFailed(failedStep, sanitizeErrorMessage(err));
      onProgress?.(steps);
    }
    return {
      success: false,
      message: `Failed to remove quickstart "${quickstartName}": ${sanitizeErrorMessage(err)}`,
      steps,
    };
  }
}
