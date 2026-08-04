import { getRegistryQuickstarts, clearRegistryCache } from '../src/services/registryClient';
import * as httpClient from '../src/utils/httpClient';

jest.mock('../src/utils/httpClient');

const mockedFetchUrl = jest.mocked(httpClient.fetchUrl);

const VALID_YAML = `
quickstarts:
  - name: lemonade-stand-assistant
    repository: https://github.com/rh-ai-quickstart/lemonade-stand-assistant
  - name: rag
    repository: https://github.com/rh-ai-quickstart/RAG
`;

describe('registryClient', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetAllMocks();
    clearRegistryCache();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('fetches and parses quickstarts.yaml', async () => {
    mockedFetchUrl.mockResolvedValue(VALID_YAML);

    const result = await getRegistryQuickstarts();
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      name: 'lemonade-stand-assistant',
      repository: 'https://github.com/rh-ai-quickstart/lemonade-stand-assistant',
    });
    expect(result[1]).toEqual({
      name: 'rag',
      repository: 'https://github.com/rh-ai-quickstart/RAG',
    });
  });

  it('constructs correct raw GitHub URL from env vars', async () => {
    process.env.QUICKSTART_REGISTRY_REPO = 'https://github.com/my-org/my-repo';
    process.env.QUICKSTART_REGISTRY_BRANCH = 'develop';
    process.env.QUICKSTART_REGISTRY_FILE = 'registry.yaml';

    mockedFetchUrl.mockResolvedValue(VALID_YAML);

    await getRegistryQuickstarts();
    expect(mockedFetchUrl).toHaveBeenCalledWith(
      'https://raw.githubusercontent.com/my-org/my-repo/develop/registry.yaml',
    );
  });

  it('returns cached data on subsequent calls', async () => {
    mockedFetchUrl.mockResolvedValue(VALID_YAML);

    const first = await getRegistryQuickstarts();
    const second = await getRegistryQuickstarts();

    expect(mockedFetchUrl).toHaveBeenCalledTimes(1);
    expect(second).toEqual(first);
  });

  it('bypasses cache when forceRefresh is true', async () => {
    mockedFetchUrl.mockResolvedValue(VALID_YAML);

    await getRegistryQuickstarts();
    await getRegistryQuickstarts(true);

    expect(mockedFetchUrl).toHaveBeenCalledTimes(2);
  });

  it('serves stale cache on fetch failure', async () => {
    mockedFetchUrl.mockResolvedValueOnce(VALID_YAML);

    await getRegistryQuickstarts();
    clearRegistryCache();

    mockedFetchUrl.mockResolvedValueOnce(VALID_YAML);
    const cached = await getRegistryQuickstarts();

    mockedFetchUrl.mockRejectedValueOnce(new Error('Network error'));
    const stale = await getRegistryQuickstarts(true);

    expect(stale).toEqual(cached);
  });

  it('throws when fetch fails and no stale cache exists', async () => {
    mockedFetchUrl.mockRejectedValue(new Error('Network error'));

    await expect(getRegistryQuickstarts()).rejects.toThrow('Network error');
  });

  it('throws on invalid YAML format (missing quickstarts array)', async () => {
    mockedFetchUrl.mockResolvedValue('invalid: data');

    await expect(getRegistryQuickstarts()).rejects.toThrow('Invalid registry format');
  });

  it('filters out invalid registry entries', async () => {
    const yamlWithInvalid = `
quickstarts:
  - name: valid-qs
    repository: https://github.com/org/valid-qs
  - name: ""
    repository: https://github.com/org/empty-name
  - repository: https://github.com/org/no-name
  - name: no-repo
`;
    mockedFetchUrl.mockResolvedValue(yamlWithInvalid);

    const result = await getRegistryQuickstarts();
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('valid-qs');
  });

  it('respects CACHE_TTL env var (in seconds)', async () => {
    process.env.CACHE_TTL = '1';
    mockedFetchUrl.mockResolvedValue(VALID_YAML);

    await getRegistryQuickstarts();

    await new Promise((resolve) => setTimeout(resolve, 1100));

    await getRegistryQuickstarts();
    expect(mockedFetchUrl).toHaveBeenCalledTimes(2);
  }, 3000);
});
