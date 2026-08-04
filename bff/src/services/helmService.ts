import { execFile } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { getK8sBaseUrl } from '../utils/k8sClient';

const HELM_BIN = process.env.HELM_BIN || 'helm';
const HELM_TIMEOUT_MS = 330_000;
const HELM_OP_TIMEOUT = '5m';
const MAX_BUFFER = 5 * 1024 * 1024;
const CA_PATH = '/var/run/secrets/kubernetes.io/serviceaccount/ca.crt';

export interface HelmRelease {
  name: string;
  namespace: string;
  status: string;
  chart: string;
  app_version: string;
}

const VALUE_KEY_PATTERN = /^[a-zA-Z0-9._-]+$/;
const VALUE_STRING_PATTERN = /^[a-zA-Z0-9._:/@=+\- ]*$/;

export function validateHelmValues(values: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(values)) {
    if (!VALUE_KEY_PATTERN.test(key)) {
      throw new Error(`Invalid Helm value key: keys must match ${VALUE_KEY_PATTERN}`);
    }
    const valueType = typeof value;
    if (valueType !== 'string' && valueType !== 'number' && valueType !== 'boolean') {
      throw new Error(`Invalid Helm value type for key "${key}": only string, number, and boolean are allowed`);
    }
    if (valueType === 'string' && !VALUE_STRING_PATTERN.test(value as string)) {
      throw new Error(`Invalid Helm value for key "${key}": contains disallowed characters`);
    }
  }
}

export function sanitizeHelmError(message: string): string {
  return message
    .replace(/--kubeconfig\s+\S+/g, '--kubeconfig [REDACTED]')
    .replace(/--kube-token\s+\S+/g, '--kube-token [REDACTED]')
    .replace(/token:\s+"[^"]*"/g, 'token: "[REDACTED]"')
    .replace(/system:serviceaccount:[^\s"]+/g, '[service-account]')
    .replace(/https?:\/\/\d+\.\d+\.\d+\.\d+:\d+/g, '[api-server]');
}

function buildKubeconfig(baseUrl: string, token: string): string {
  const clusterConfig: string[] = [
    '    server: "' + baseUrl + '"',
  ];

  if (process.env.K8S_TLS_INSECURE === 'true') {
    clusterConfig.push('    insecure-skip-tls-verify: true');
  } else if (fs.existsSync(CA_PATH)) {
    clusterConfig.push('    certificate-authority: "' + CA_PATH + '"');
  }

  return [
    'apiVersion: v1',
    'kind: Config',
    'clusters:',
    '- cluster:',
    ...clusterConfig,
    '  name: target',
    'contexts:',
    '- context:',
    '    cluster: target',
    '    user: user',
    '  name: target',
    'current-context: target',
    'users:',
    '- name: user',
    '  user:',
    '    token: "' + token + '"',
  ].join('\n');
}

function runHelm(args: string[], token: string): Promise<string> {
  const baseUrl = getK8sBaseUrl();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'helm-'));
  const kubeconfigPath = path.join(tmpDir, 'kubeconfig');

  fs.writeFileSync(kubeconfigPath, buildKubeconfig(baseUrl, token), { mode: 0o600 });

  const fullArgs = [...args, '--kubeconfig', kubeconfigPath, '--kube-apiserver', baseUrl];

  return new Promise<string>((resolve, reject) => {
    execFile(
      HELM_BIN,
      fullArgs,
      {
        timeout: HELM_TIMEOUT_MS,
        maxBuffer: MAX_BUFFER,
        env: {
          ...process.env,
          HELM_CACHE_HOME: path.join(tmpDir, 'cache'),
          HELM_CONFIG_HOME: path.join(tmpDir, 'config'),
          HELM_DATA_HOME: path.join(tmpDir, 'data'),
        },
      },
      (error, stdout, stderr) => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
        if (error) {
          const rawMessage = stderr || error.message;
          reject(new Error(sanitizeHelmError(rawMessage)));
        } else {
          resolve(stdout);
        }
      },
    );
  });
}

export async function helmInstall(
  releaseName: string,
  chart: string,
  namespace: string,
  token: string,
  values?: Record<string, unknown>,
  version?: string,
): Promise<string> {
  if (values) validateHelmValues(values);

  const args = [
    'install', releaseName, chart,
    '--namespace', namespace,
    '--create-namespace',
    '--wait',
    '--timeout', HELM_OP_TIMEOUT,
    '--output', 'json',
  ];

  if (version) args.push('--version', version);
  if (values) {
    for (const [key, value] of Object.entries(values)) {
      args.push('--set', `${key}=${String(value)}`);
    }
  }

  return runHelm(args, token);
}

export async function helmUpgrade(
  releaseName: string,
  chart: string,
  namespace: string,
  token: string,
  values?: Record<string, unknown>,
  version?: string,
): Promise<string> {
  if (values) validateHelmValues(values);

  const args = [
    'upgrade', releaseName, chart,
    '--namespace', namespace,
    '--wait',
    '--timeout', HELM_OP_TIMEOUT,
    '--output', 'json',
  ];

  if (version) args.push('--version', version);
  if (values) {
    for (const [key, value] of Object.entries(values)) {
      args.push('--set', `${key}=${String(value)}`);
    }
  }

  return runHelm(args, token);
}

export function helmUninstall(
  releaseName: string,
  namespace: string,
  token: string,
): Promise<string> {
  return runHelm(
    ['uninstall', releaseName, '--namespace', namespace, '--wait', '--timeout', HELM_OP_TIMEOUT],
    token,
  );
}

export async function helmList(namespace: string, token: string): Promise<HelmRelease[]> {
  const output = await runHelm(
    ['list', '--namespace', namespace, '--output', 'json'],
    token,
  );

  if (!output || output.trim() === '') return [];

  const releases: HelmRelease[] = JSON.parse(output);
  return releases;
}
