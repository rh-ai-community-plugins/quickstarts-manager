import { Router, Request, Response } from 'express';
import { getRegistryQuickstarts } from '../services/registryClient';
import { getAllQuickstartMetadata, getQuickstartMetadata, clearMetadataCache } from '../services/quickstartMetadataClient';
import { QUICKSTART_NAME_PATTERN } from '../utils/validation';
import { CatalogQuickstart, QuickstartMetadata, RegistryQuickstart } from '../types/catalog';

const router = Router();
const REFRESH_COOLDOWN_MS = 30_000;
let lastRefreshAt = 0;

function buildCatalogQuickstart(
  registry: RegistryQuickstart,
  metadata: QuickstartMetadata | null,
): CatalogQuickstart {
  const base: CatalogQuickstart = {
    name: registry.name,
    repository: registry.repository,
    metadataAvailable: metadata !== null,
  };

  if (!metadata) return base;

  return {
    ...base,
    displayName: metadata.displayName,
    description: metadata.description,
    version: metadata.version,
    icon: metadata.icon,
    maintainer: metadata.maintainer,
    deployment: metadata.deployment,
    rbac: metadata.rbac,
    prerequisites: metadata.prerequisites,
    tags: metadata.tags,
  };
}

router.get('/', async (req: Request, res: Response) => {
  try {
    let forceRefresh = req.query.refresh === 'true';
    if (forceRefresh) {
      const now = Date.now();
      if (now - lastRefreshAt < REFRESH_COOLDOWN_MS) {
        forceRefresh = false;
      } else {
        lastRefreshAt = now;
        clearMetadataCache();
      }
    }

    const registryQuickstarts = await getRegistryQuickstarts(forceRefresh);
    const metadataMap = await getAllQuickstartMetadata(registryQuickstarts);

    const catalog: CatalogQuickstart[] = registryQuickstarts.map((qs) =>
      buildCatalogQuickstart(qs, metadataMap.get(qs.name) ?? null),
    );

    const total = registryQuickstarts.length;
    const unavailableCount = registryQuickstarts.filter(
      (qs) => (metadataMap.get(qs.name) ?? null) === null,
    ).length;

    const warnings: string[] = [];
    if (total >= 2 && unavailableCount / total > 0.5) {
      const msg = `Metadata unavailable for ${unavailableCount} of ${total} quickstarts. This may indicate a temporary issue fetching quickstart details.`;
      console.warn(msg);
      warnings.push(msg);
    }

    const response: { quickstarts: CatalogQuickstart[]; warnings?: string[] } = { quickstarts: catalog };
    if (warnings.length > 0) {
      response.warnings = warnings;
    }

    res.json(response);
  } catch (err) {
    console.error('Failed to build catalog:', (err as Error).message);
    res.status(502).json({ error: 'Failed to fetch quickstart catalog' });
  }
});

router.get('/:name', async (req: Request, res: Response) => {
  try {
    const { name } = req.params;

    if (!QUICKSTART_NAME_PATTERN.test(name)) {
      res.status(400).json({ error: 'Invalid quickstart name format' });
      return;
    }

    const registryQuickstarts = await getRegistryQuickstarts();
    const registryEntry = registryQuickstarts.find((qs) => qs.name === name);

    if (!registryEntry) {
      res.status(404).json({ error: 'Quickstart not found in registry' });
      return;
    }

    const metadata = await getQuickstartMetadata(registryEntry);
    const quickstart = buildCatalogQuickstart(registryEntry, metadata);

    res.json(quickstart);
  } catch (err) {
    console.error('Failed to fetch quickstart details:', (err as Error).message);
    res.status(502).json({ error: 'Failed to fetch quickstart details' });
  }
});

export default router;
