import { getProxyAgent } from '../src/utils/proxyAgent';
import * as settingsService from '../src/services/settingsService';

jest.mock('../src/services/settingsService');

const mockedGetSettings = jest.mocked(settingsService.getSettings);

describe('proxyAgent', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('returns undefined when no proxy is configured', () => {
    mockedGetSettings.mockReturnValue({ githubToken: null, proxyUrl: null, source: 'default' });
    expect(getProxyAgent()).toBeUndefined();
  });

  it('returns an agent when proxyUrl is configured', () => {
    mockedGetSettings.mockReturnValue({ githubToken: null, proxyUrl: 'http://proxy:3128', source: 'env' });
    expect(getProxyAgent()).toBeDefined();
  });

  it('caches agent instance for the same proxyUrl', () => {
    mockedGetSettings.mockReturnValue({ githubToken: null, proxyUrl: 'http://proxy:3128', source: 'env' });
    const first = getProxyAgent();
    const second = getProxyAgent();
    expect(first).toBe(second);
  });

  it('creates new agent when proxyUrl changes', () => {
    mockedGetSettings.mockReturnValue({ githubToken: null, proxyUrl: 'http://proxy:3128', source: 'env' });
    const first = getProxyAgent();

    mockedGetSettings.mockReturnValue({ githubToken: null, proxyUrl: 'http://other:8080', source: 'env' });
    const second = getProxyAgent();

    expect(first).not.toBe(second);
  });

  it('returns undefined when proxy is removed', () => {
    mockedGetSettings.mockReturnValue({ githubToken: null, proxyUrl: 'http://proxy:3128', source: 'env' });
    expect(getProxyAgent()).toBeDefined();

    mockedGetSettings.mockReturnValue({ githubToken: null, proxyUrl: null, source: 'default' });
    expect(getProxyAgent()).toBeUndefined();
  });
});
