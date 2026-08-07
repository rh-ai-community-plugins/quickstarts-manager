import http from 'http';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { getSettings } from '../services/settingsService';

let cachedAgent: http.Agent | undefined;
let cachedProxyUrl: string | undefined;

export function getProxyAgent(): http.Agent | undefined {
  const { proxyUrl } = getSettings();
  if (!proxyUrl) {
    cachedAgent = undefined;
    cachedProxyUrl = undefined;
    return undefined;
  }
  if (proxyUrl === cachedProxyUrl && cachedAgent) {
    return cachedAgent;
  }
  cachedAgent = new HttpsProxyAgent(proxyUrl);
  cachedProxyUrl = proxyUrl;
  return cachedAgent;
}
