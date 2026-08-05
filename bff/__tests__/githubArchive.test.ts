import { buildGitHubArchiveUrl, downloadRepoChart, cleanupExtractedChart } from '../src/utils/githubArchive';
import fs from 'fs';
import https from 'https';
import { EventEmitter } from 'events';

jest.mock('child_process');
jest.mock('fs', () => {
  const actual = jest.requireActual('fs');
  return {
    ...actual,
    mkdtempSync: jest.fn(),
    mkdirSync: jest.fn(),
    createWriteStream: jest.fn(),
    readdirSync: jest.fn(),
    realpathSync: jest.fn(),
    existsSync: jest.fn(),
    rmSync: jest.fn(),
    writeFileSync: jest.fn(),
  };
});
jest.mock('https');

const mockedFs = jest.mocked(fs);
const mockedHttps = jest.mocked(https);

describe('githubArchive', () => {
  describe('buildGitHubArchiveUrl', () => {
    it('builds correct API tarball URL', () => {
      const url = buildGitHubArchiveUrl('https://github.com/org/repo', 'main');
      expect(url).toBe('https://api.github.com/repos/org/repo/tarball/main');
    });

    it('strips .git suffix from repo URL', () => {
      const url = buildGitHubArchiveUrl('https://github.com/org/repo.git', 'main');
      expect(url).toBe('https://api.github.com/repos/org/repo/tarball/main');
    });

    it('returns null for non-GitHub URL', () => {
      expect(buildGitHubArchiveUrl('https://gitlab.com/org/repo', 'main')).toBeNull();
    });

    it('encodes branch names with special characters', () => {
      const url = buildGitHubArchiveUrl('https://github.com/org/repo', 'feat/my branch');
      expect(url).toBe('https://api.github.com/repos/org/repo/tarball/feat%2Fmy%20branch');
    });

    it('handles URLs with trailing path segments', () => {
      const url = buildGitHubArchiveUrl('https://github.com/org/repo/tree/main', 'dev');
      expect(url).toBe('https://api.github.com/repos/org/repo/tarball/dev');
    });
  });

  describe('downloadRepoChart', () => {
    it('rejects path traversal in chart path', async () => {
      await expect(
        downloadRepoChart('https://github.com/org/repo', '../../etc/passwd', 'main'),
      ).rejects.toThrow('Invalid chart path');
    });

    it('rejects chart paths with double dots', async () => {
      await expect(
        downloadRepoChart('https://github.com/org/repo', 'chart/../../../etc', 'main'),
      ).rejects.toThrow('Invalid chart path');
    });

    it('rejects non-GitHub repository URL', async () => {
      await expect(
        downloadRepoChart('https://gitlab.com/org/repo', 'chart/', 'main'),
      ).rejects.toThrow('Cannot build archive URL');
    });

    it('strips trailing slashes from chart path', async () => {
      // This should fail at the download step (not at path validation)
      // because "chart/" is valid after normalization to "chart"
      mockedFs.mkdtempSync.mockReturnValue('/tmp/qs-chart-test');

      // Mock the download to fail so we can verify path was accepted
      const mockReq = new EventEmitter() as any;
      mockedHttps.get.mockImplementation((_url, _opts, _cb) => {
        setTimeout(() => mockReq.emit('error', new Error('connection refused')), 0);
        return mockReq;
      });

      await expect(
        downloadRepoChart('https://github.com/org/repo', 'chart/', 'main'),
      ).rejects.toThrow('connection refused');

      expect(mockedFs.rmSync).toHaveBeenCalledWith('/tmp/qs-chart-test', { recursive: true, force: true });
    });
  });

  describe('cleanupExtractedChart', () => {
    it('calls rmSync on the temp directory', () => {
      cleanupExtractedChart('/tmp/qs-chart-test');
      expect(mockedFs.rmSync).toHaveBeenCalledWith('/tmp/qs-chart-test', { recursive: true, force: true });
    });

    it('does not throw if directory is already removed', () => {
      mockedFs.rmSync.mockImplementation(() => {
        throw new Error('ENOENT');
      });
      expect(() => cleanupExtractedChart('/tmp/gone')).not.toThrow();
    });
  });
});
