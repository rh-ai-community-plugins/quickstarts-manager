import https from 'https';
import http from 'http';
import fs from 'fs';
import { getK8sBaseUrl } from '../utils/k8sClient';

const REQUEST_TIMEOUT_MS = 30_000;
const MAX_BODY_BYTES = 10 * 1024 * 1024;
const CA_PATH = '/var/run/secrets/kubernetes.io/serviceaccount/ca.crt';

let cachedCa: Buffer | undefined;
try {
  cachedCa = fs.readFileSync(CA_PATH);
} catch {
  // Not running in-cluster
}

export interface OpenShiftRoute {
  metadata: {
    name: string;
    namespace: string;
  };
  spec: {
    host: string;
    path?: string;
    to: {
      kind: string;
      name: string;
    };
    tls?: {
      termination: string;
    };
  };
}

export interface RouteInfo {
  name: string;
  host: string;
  path: string;
  url: string;
  tlsEnabled: boolean;
}

export function k8sApiRequest<T = unknown>(
  token: string,
  apiPath: string,
  method: string = 'GET',
  body?: unknown,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const baseUrl = getK8sBaseUrl();
    const url = new URL(apiPath, baseUrl);
    const isHttps = url.protocol === 'https:';

    const options: https.RequestOptions = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
    };

    if (isHttps) {
      if (process.env.K8S_TLS_INSECURE === 'true') {
        options.rejectUnauthorized = false;
      } else if (cachedCa) {
        options.ca = cachedCa;
      }
    }

    const serializedBody = body ? JSON.stringify(body) : undefined;
    if (serializedBody) {
      (options.headers as Record<string, string>)['Content-Type'] = 'application/json';
      (options.headers as Record<string, string>)['Content-Length'] = String(Buffer.byteLength(serializedBody));
    }

    const transport = isHttps ? https : http;
    const req = transport.request(options, (res) => {
      let data = '';
      let receivedBytes = 0;

      res.on('data', (chunk: Buffer | string) => {
        receivedBytes += typeof chunk === 'string' ? Buffer.byteLength(chunk) : chunk.length;
        if (receivedBytes > MAX_BODY_BYTES) {
          req.destroy();
          reject(new Error(`K8s API response exceeded ${MAX_BODY_BYTES} bytes`));
          return;
        }
        data += chunk;
      });

      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(data) as T);
          } catch {
            reject(new Error('Failed to parse K8s API response JSON'));
          }
        } else {
          reject(new Error(`K8s API returned ${res.statusCode}: ${data}`));
        }
      });
    });

    req.setTimeout(REQUEST_TIMEOUT_MS, () => {
      req.destroy();
      reject(new Error(`K8s API request timed out after ${REQUEST_TIMEOUT_MS}ms`));
    });

    req.on('error', reject);

    if (serializedBody) {
      req.write(serializedBody);
    }
    req.end();
  });
}

interface RouteListResponse {
  items: OpenShiftRoute[];
}

export async function discoverRoutes(namespace: string, token: string): Promise<RouteInfo[]> {
  let routeList: RouteListResponse;
  try {
    routeList = await k8sApiRequest<RouteListResponse>(
      token,
      `/apis/route.openshift.io/v1/namespaces/${encodeURIComponent(namespace)}/routes`,
    );
  } catch (err) {
    if (err instanceof Error && err.message.includes('404')) {
      return [];
    }
    throw err;
  }

  return routeList.items.map((route) => {
    const tlsEnabled = !!route.spec.tls;
    const protocol = tlsEnabled ? 'https' : 'http';
    const routePath = route.spec.path || '/';
    return {
      name: route.metadata.name,
      host: route.spec.host,
      path: routePath,
      url: `${protocol}://${route.spec.host}${routePath}`,
      tlsEnabled,
    };
  });
}
