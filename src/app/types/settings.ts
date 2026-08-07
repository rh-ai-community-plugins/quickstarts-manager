export interface PluginSettings {
  githubToken: string | null;
  proxyUrl: string | null;
  source: 'secret' | 'env' | 'default';
}
