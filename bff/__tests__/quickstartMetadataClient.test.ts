import { getQuickstartMetadata, getAllQuickstartMetadata, clearMetadataCache } from '../src/services/quickstartMetadataClient';
import * as httpClient from '../src/utils/httpClient';
import { RegistryQuickstart } from '../src/types/catalog';

jest.mock('../src/utils/httpClient');

const mockedFetchUrl = jest.mocked(httpClient.fetchUrl);

const VALID_QUICKSTART_YAML = `
name: lemonade-stand-assistant
displayName: Lemonade Stand Assistant
description: A chatbot that helps you run a lemonade stand
version: "1.0.0"
maintainer:
  name: RHOAI Team
  github: rh-ai-quickstart
repository: https://github.com/rh-ai-quickstart/lemonade-stand-assistant
deployment:
  scope: project
  chart:
    type: oci
    ref: oci://quay.io/rh-ai-quickstart/lemonade-stand-assistant
tags:
  - chatbot
  - llm
prerequisites:
  - GPU node with at least 16GB VRAM
`;

const REGISTRY_ENTRY: RegistryQuickstart = {
  name: 'lemonade-stand-assistant',
  repository: 'https://github.com/rh-ai-quickstart/lemonade-stand-assistant',
};

describe('quickstartMetadataClient', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    clearMetadataCache();
  });

  describe('getQuickstartMetadata', () => {
    it('fetches and parses quickstart.yaml', async () => {
      mockedFetchUrl.mockResolvedValue(VALID_QUICKSTART_YAML);

      const result = await getQuickstartMetadata(REGISTRY_ENTRY);
      expect(result).not.toBeNull();
      expect(result!.name).toBe('lemonade-stand-assistant');
      expect(result!.displayName).toBe('Lemonade Stand Assistant');
      expect(result!.version).toBe('1.0.0');
      expect(result!.deployment.scope).toBe('project');
      expect(result!.tags).toEqual(['chatbot', 'llm']);
    });

    it('constructs correct raw GitHub URL', async () => {
      mockedFetchUrl.mockResolvedValue(VALID_QUICKSTART_YAML);

      await getQuickstartMetadata(REGISTRY_ENTRY);
      expect(mockedFetchUrl).toHaveBeenCalledWith(
        'https://raw.githubusercontent.com/rh-ai-quickstart/lemonade-stand-assistant/main/quickstart.yaml',
      );
    });

    it('returns cached metadata on subsequent calls', async () => {
      mockedFetchUrl.mockResolvedValue(VALID_QUICKSTART_YAML);

      await getQuickstartMetadata(REGISTRY_ENTRY);
      await getQuickstartMetadata(REGISTRY_ENTRY);

      expect(mockedFetchUrl).toHaveBeenCalledTimes(1);
    });

    it('returns null for non-GitHub repositories', async () => {
      const entry: RegistryQuickstart = {
        name: 'non-github',
        repository: 'https://gitlab.com/org/repo',
      };

      const result = await getQuickstartMetadata(entry);
      expect(result).toBeNull();
      expect(mockedFetchUrl).not.toHaveBeenCalled();
    });

    it('returns null on fetch failure', async () => {
      mockedFetchUrl.mockRejectedValue(new Error('404 Not Found'));

      const result = await getQuickstartMetadata(REGISTRY_ENTRY);
      expect(result).toBeNull();
    });

    it('returns null for malformed YAML (missing required fields)', async () => {
      mockedFetchUrl.mockResolvedValue('name: test-only\nsome: value');

      const result = await getQuickstartMetadata(REGISTRY_ENTRY);
      expect(result).toBeNull();
    });

    it('strips .git suffix from repository URL', async () => {
      mockedFetchUrl.mockResolvedValue(VALID_QUICKSTART_YAML);

      await getQuickstartMetadata({
        name: 'test',
        repository: 'https://github.com/org/repo.git',
      });
      expect(mockedFetchUrl).toHaveBeenCalledWith(
        'https://raw.githubusercontent.com/org/repo/main/quickstart.yaml',
      );
    });
  });

  describe('getAllQuickstartMetadata', () => {
    it('fetches metadata for all quickstarts concurrently', async () => {
      mockedFetchUrl.mockResolvedValue(VALID_QUICKSTART_YAML);

      const entries: RegistryQuickstart[] = [
        { name: 'qs-1', repository: 'https://github.com/org/qs-1' },
        { name: 'qs-2', repository: 'https://github.com/org/qs-2' },
        { name: 'qs-3', repository: 'https://github.com/org/qs-3' },
      ];

      const result = await getAllQuickstartMetadata(entries);
      expect(result.size).toBe(3);
      expect(mockedFetchUrl).toHaveBeenCalledTimes(3);
    });

    it('handles mixed success and failure', async () => {
      mockedFetchUrl
        .mockResolvedValueOnce(VALID_QUICKSTART_YAML)
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce(VALID_QUICKSTART_YAML);

      const entries: RegistryQuickstart[] = [
        { name: 'qs-1', repository: 'https://github.com/org/qs-1' },
        { name: 'qs-2', repository: 'https://github.com/org/qs-2' },
        { name: 'qs-3', repository: 'https://github.com/org/qs-3' },
      ];

      const result = await getAllQuickstartMetadata(entries);
      expect(result.get('qs-1')).not.toBeNull();
      expect(result.get('qs-2')).toBeNull();
      expect(result.get('qs-3')).not.toBeNull();
    });

    it('returns empty map for empty input', async () => {
      const result = await getAllQuickstartMetadata([]);
      expect(result.size).toBe(0);
    });
  });

  describe('clearMetadataCache', () => {
    it('clears a single entry', async () => {
      mockedFetchUrl.mockResolvedValue(VALID_QUICKSTART_YAML);

      await getQuickstartMetadata(REGISTRY_ENTRY);
      clearMetadataCache(REGISTRY_ENTRY.name);
      await getQuickstartMetadata(REGISTRY_ENTRY);

      expect(mockedFetchUrl).toHaveBeenCalledTimes(2);
    });

    it('clears all entries when no name provided', async () => {
      mockedFetchUrl.mockResolvedValue(VALID_QUICKSTART_YAML);

      await getQuickstartMetadata(REGISTRY_ENTRY);
      clearMetadataCache();
      await getQuickstartMetadata(REGISTRY_ENTRY);

      expect(mockedFetchUrl).toHaveBeenCalledTimes(2);
    });
  });
});
