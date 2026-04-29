import { Injectable } from '@angular/core';
import { AskGuruKnowledgePayload } from '../models/ask-guru.model';

@Injectable({ providedIn: 'root' })
export class AskGuruKnowledgeService {
  private cache: AskGuruKnowledgePayload | null = null;
  private inFlight: Promise<AskGuruKnowledgePayload> | null = null;

  loadKnowledge(): Promise<AskGuruKnowledgePayload> {
    if (this.cache) return Promise.resolve(this.cache);
    if (this.inFlight) return this.inFlight;

    this.inFlight = fetch('/data/ask-to-guru-knowledge.json')
      .then(async (res) => {
        if (!res.ok) {
          throw new Error(`Ask to Guru knowledge load failed: ${res.status}`);
        }
        const payload = (await res.json()) as AskGuruKnowledgePayload;
        const items = Array.isArray(payload.items)
          ? payload.items.filter((item) => typeof item.id === 'string' && item.id.trim().length > 0)
          : [];
        const pageContexts = Array.isArray(payload.pageContexts)
          ? payload.pageContexts.filter(
              (ctx) => typeof ctx.id === 'string' && Array.isArray(ctx.routePatterns),
            )
          : [];
        this.cache = { pageContexts, items };
        return this.cache;
      })
      .catch(() => {
        this.cache = { pageContexts: [], items: [] };
        return this.cache;
      })
      .finally(() => {
        this.inFlight = null;
      });

    return this.inFlight;
  }
}
