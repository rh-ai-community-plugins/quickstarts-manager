import http from 'http';
import express from 'express';
import catalogRouter from '../src/routes/catalog';
import * as registryClient from '../src/services/registryClient';
import * as metadataClient from '../src/services/quickstartMetadataClient';
import { RegistryQuickstart, QuickstartMetadata } from '../src/types/catalog';

jest.mock('../src/services/registryClient');
jest.mock('../src/services/quickstartMetadataClient');

const mockedGetRegistry = jest.mocked(registryClient.getRegistryQuickstarts);
const mockedGetAllMetadata = jest.mocked(metadataClient.getAllQuickstartMetadata);
const mockedGetMetadata = jest.mocked(metadataClient.getQuickstartMetadata);
const mockedClearMetadata = jest.mocked(metadataClient.clearMetadataCache);

const REGISTRY_ENTRIES: RegistryQuickstart[] = [
  { name: 'lemonade', repository: 'https://github.com/org/lemonade' },
  { name: 'rag', repository: 'https://github.com/org/rag' },
];

const METADATA: QuickstartMetadata = {
  name: 'lemonade',
  displayName: 'Lemonade Stand',
  description: 'A chatbot quickstart',
  version: '1.0.0',
  maintainer: { name: 'RHOAI Team' },
  repository: 'https://github.com/org/lemonade',
  deployment: {
    scope: 'project',
    chart: { type: 'oci', ref: 'oci://quay.io/org/lemonade' },
  },
  tags: ['chatbot'],
};

function request(port: number, path: string): Promise<{ statusCode: number; body: string }> {
  return new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${port}${path}`, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => resolve({ statusCode: res.statusCode!, body }));
    }).on('error', reject);
  });
}

describe('catalog routes', () => {
  let server: http.Server;
  let port: number;

  beforeAll((done) => {
    const app = express();
    app.use('/api/catalog', catalogRouter);
    server = app.listen(0, () => {
      port = (server.address() as any).port;
      done();
    });
  });

  afterAll((done) => {
    server.close(done);
  });

  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe('GET /api/catalog', () => {
    it('returns merged catalog with metadata', async () => {
      mockedGetRegistry.mockResolvedValue(REGISTRY_ENTRIES);
      const metadataMap = new Map<string, QuickstartMetadata | null>();
      metadataMap.set('lemonade', METADATA);
      metadataMap.set('rag', null);
      mockedGetAllMetadata.mockResolvedValue(metadataMap);

      const res = await request(port, '/api/catalog');
      expect(res.statusCode).toBe(200);

      const body = JSON.parse(res.body);
      expect(body.quickstarts).toHaveLength(2);

      const lemonade = body.quickstarts[0];
      expect(lemonade.name).toBe('lemonade');
      expect(lemonade.displayName).toBe('Lemonade Stand');
      expect(lemonade.metadataAvailable).toBe(true);
      expect(lemonade.version).toBe('1.0.0');
      expect(lemonade.tags).toEqual(['chatbot']);

      const rag = body.quickstarts[1];
      expect(rag.name).toBe('rag');
      expect(rag.metadataAvailable).toBe(false);
      expect(rag.displayName).toBeUndefined();
    });

    it('clears metadata cache and forces registry refresh on ?refresh=true', async () => {
      mockedGetRegistry.mockResolvedValue([]);
      mockedGetAllMetadata.mockResolvedValue(new Map());

      await request(port, '/api/catalog?refresh=true');

      expect(mockedClearMetadata).toHaveBeenCalledWith();
      expect(mockedGetRegistry).toHaveBeenCalledWith(true);
    });

    it('includes warnings when most metadata is unavailable', async () => {
      mockedGetRegistry.mockResolvedValue(REGISTRY_ENTRIES);
      const metadataMap = new Map<string, QuickstartMetadata | null>();
      metadataMap.set('lemonade', null);
      metadataMap.set('rag', null);
      mockedGetAllMetadata.mockResolvedValue(metadataMap);

      const res = await request(port, '/api/catalog');
      const body = JSON.parse(res.body);

      expect(body.warnings).toBeDefined();
      expect(body.warnings[0]).toContain('Metadata unavailable');
    });

    it('returns 502 when registry fetch fails', async () => {
      mockedGetRegistry.mockRejectedValue(new Error('Network error'));

      const res = await request(port, '/api/catalog');
      expect(res.statusCode).toBe(502);
      expect(JSON.parse(res.body).error).toContain('Failed to fetch');
    });
  });

  describe('GET /api/catalog/:name', () => {
    it('returns a single quickstart with metadata', async () => {
      mockedGetRegistry.mockResolvedValue(REGISTRY_ENTRIES);
      mockedGetMetadata.mockResolvedValue(METADATA);

      const res = await request(port, '/api/catalog/lemonade');
      expect(res.statusCode).toBe(200);

      const body = JSON.parse(res.body);
      expect(body.name).toBe('lemonade');
      expect(body.displayName).toBe('Lemonade Stand');
      expect(body.metadataAvailable).toBe(true);
    });

    it('returns 404 for unknown quickstart', async () => {
      mockedGetRegistry.mockResolvedValue(REGISTRY_ENTRIES);

      const res = await request(port, '/api/catalog/nonexistent');
      expect(res.statusCode).toBe(404);
      expect(JSON.parse(res.body).error).toContain('not found');
    });

    it('returns quickstart with metadataAvailable=false when metadata fetch fails', async () => {
      mockedGetRegistry.mockResolvedValue(REGISTRY_ENTRIES);
      mockedGetMetadata.mockResolvedValue(null);

      const res = await request(port, '/api/catalog/lemonade');
      expect(res.statusCode).toBe(200);

      const body = JSON.parse(res.body);
      expect(body.name).toBe('lemonade');
      expect(body.metadataAvailable).toBe(false);
      expect(body.displayName).toBeUndefined();
    });

    it('returns 502 on internal error', async () => {
      mockedGetRegistry.mockRejectedValue(new Error('Internal error'));

      const res = await request(port, '/api/catalog/lemonade');
      expect(res.statusCode).toBe(502);
    });
  });
});
