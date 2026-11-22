/**
 * OSINT ROUTES
 *
 * Mounted on the existing express app by the Vercel entry (api/index.ts) and by the local
 * development entry (dev.ts). Keeping the routes in their own small module means the
 * platform files stay stable while the feed grows.
 *
 *   GET /api/osint/feed              aggregated published records, cached for a minute
 *   GET /api/osint/insiders?cik=...  live SEC Form 4 filings for one Georgia bank company
 *   GET /api/osint/filing?...        one EDGAR filing document, parsed for the detail page
 */

import type { Express, Request, Response } from 'express';
import {
  buildOsintFeed,
  fetchFilingDetail,
  fetchInsiders,
  OSINT_SOURCE_NOTE,
} from './osintFeed.ts';

type FeedPayload = Awaited<ReturnType<typeof buildOsintFeed>>;

let cache: { at: number; payload: FeedPayload } | null = null;

export function installOsintRoutes(app: Express): void {
  app.get('/api/osint/feed', async (_req: Request, res: Response) => {
    try {
      const now = Date.now();
      const feed = cache && now - cache.at < 55_000 ? cache.payload : await buildOsintFeed();
      cache = { at: now, payload: feed };
      res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
      res.json(feed);
    } catch (error) {
      res.status(502).json({
        error: error instanceof Error ? error.message : 'OSINT sources unavailable',
        note: OSINT_SOURCE_NOTE,
      });
    }
  });

  app.get('/api/osint/insiders', async (req: Request, res: Response) => {
    const cik = String(req.query.cik ?? '').replace(/[^0-9]/g, '');
    if (!cik) {
      res.status(400).json({ error: 'cik query parameter required' });
      return;
    }
    const payload = await fetchInsiders(cik);
    res.setHeader('Cache-Control', 'public, s-maxage=604800, stale-while-revalidate=86400');
    res.json(payload);
  });

  app.get('/api/osint/filing', async (req: Request, res: Response) => {
    const cik = String(req.query.cik ?? '').replace(/[^0-9]/g, '');
    const accession = String(req.query.accession ?? '').replace(/[^0-9-]/g, '');
    const document = String(req.query.document ?? '').replace(/[^A-Za-z0-9._/-]/g, '');
    if (!cik || !accession) {
      res.status(400).json({ error: 'cik and accession query parameters required' });
      return;
    }
    const payload = await fetchFilingDetail(cik, accession, document);
    res.setHeader('Cache-Control', 'public, s-maxage=604800');
    res.json(payload);
  });
}
