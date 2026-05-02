import { Injectable } from '@angular/core';
import {
  AskGuruKnowledgeItem,
  AskGuruMatchResult,
  AskGuruPageContext,
  AskGuruSuggestion,
} from '../models/ask-guru.model';
import { AskGuruKnowledgeService } from './ask-guru-knowledge.service';

@Injectable({ providedIn: 'root' })
export class AskGuruAssistantService {
  private readonly strongMatchThreshold = 56;
  private readonly fallbackContext: AskGuruPageContext = {
    id: 'general',
    title: 'this page',
    routePatterns: [],
    intro: 'I can help you with actions available here.',
  };

  constructor(private readonly knowledgeService: AskGuruKnowledgeService) {}

  async matchQuestion(question: string, routeUrl: string): Promise<AskGuruMatchResult> {
    const knowledge = await this.knowledgeService.loadKnowledge();
    const items = knowledge.items;
    const context = this.resolveContext(routeUrl, knowledge.pageContexts);
    const normalizedInput = this.normalize(question);
    if (!normalizedInput) {
      return {
        item: null,
        score: 0,
        suggestions: this.contextSuggestions(context, items),
      };
    }

    const ranked = items
      .map((item) => ({ item, score: this.computeScore(normalizedInput, item, context.id) }))
      .sort((a, b) => b.score - a.score);

    const best = ranked[0];
    if (!best || best.score < this.strongMatchThreshold) {
      const fallbackSuggestions = ranked
        .filter((row) => row.score > 0)
        .slice(0, 4)
        .map((row) => row.item);
      return {
        item: null,
        score: best?.score ?? 0,
        suggestions: this.toSuggestions(
          fallbackSuggestions.length ? fallbackSuggestions : this.contextScopedItems(context, items).slice(0, 4),
        ),
      };
    }

    const suggestions = this.relatedSuggestions(best.item, items);
    return {
      item: best.item,
      score: best.score,
      suggestions: this.toSuggestions(suggestions),
    };
  }

  async initialSuggestions(
    routeUrl: string,
  ): Promise<{ suggestions: AskGuruSuggestion[]; context: AskGuruPageContext }> {
    const knowledge = await this.knowledgeService.loadKnowledge();
    const context = this.resolveContext(routeUrl, knowledge.pageContexts);
    return {
      context,
      suggestions: this.contextSuggestions(context, knowledge.items),
    };
  }

  private contextSuggestions(
    context: AskGuruPageContext,
    allItems: AskGuruKnowledgeItem[],
  ): AskGuruSuggestion[] {
    if (Array.isArray(context.suggestionIds) && context.suggestionIds.length) {
      const configured = context.suggestionIds
        .map((id) => allItems.find((row) => row.id === id))
        .filter((row): row is AskGuruKnowledgeItem => !!row);
      if (configured.length) return this.toSuggestions(configured.slice(0, 4));
    }
    return this.toSuggestions(this.contextScopedItems(context, allItems).slice(0, 4));
  }

  private contextScopedItems(
    context: AskGuruPageContext,
    allItems: AskGuruKnowledgeItem[],
  ): AskGuruKnowledgeItem[] {
    const contextual = allItems.filter((item) => this.itemIsRelevantToContext(item, context.id));
    return contextual.length ? contextual : allItems;
  }

  private itemIsRelevantToContext(item: AskGuruKnowledgeItem, contextId: string): boolean {
    const tags = item.pageTags ?? [];
    if (tags.length === 0) return true;
    if (tags.includes('all') || tags.includes('general')) return true;
    return tags.includes(contextId);
  }

  private resolveContext(url: string, contexts: AskGuruPageContext[]): AskGuruPageContext {
    const normalized = this.normalizeUrl(url);
    const matched = contexts.find((ctx) =>
      ctx.routePatterns.some((pattern) => normalized.includes(this.normalizeUrl(pattern))),
    );
    return matched ?? this.fallbackContext;
  }

  private normalizeUrl(url: string): string {
    const clean = url.split('?')[0]?.split('#')[0] ?? '';
    return clean.toLowerCase().trim();
  }

  private relatedSuggestions(item: AskGuruKnowledgeItem, allItems: AskGuruKnowledgeItem[]): AskGuruKnowledgeItem[] {
    const relatedIds = item.relatedSuggestionIds ?? [];
    const related = relatedIds
      .map((id) => allItems.find((row) => row.id === id))
      .filter((value): value is AskGuruKnowledgeItem => !!value);
    if (related.length >= 2) return related.slice(0, 4);

    const categoryHints = new Set(item.keywords.map((k) => this.normalize(k)));
    const nearby = allItems
      .filter((row) => row.id !== item.id)
      .map((row) => ({
        row,
        overlap: row.keywords
          .map((k) => this.normalize(k))
          .filter((k) => categoryHints.has(k)).length,
      }))
      .filter((entry) => entry.overlap > 0)
      .sort((a, b) => b.overlap - a.overlap)
      .map((entry) => entry.row);
    return [...related, ...nearby].slice(0, 4);
  }

  private toSuggestions(items: AskGuruKnowledgeItem[]): AskGuruSuggestion[] {
    const seen = new Set<string>();
    return items
      .map((item) => ({
        id: item.id,
        label: item.quickActionLabel || item.title,
        query: item.questionVariations[0] || item.title,
      }))
      .filter((entry) => {
        if (!entry.query) return false;
        if (seen.has(entry.id)) return false;
        seen.add(entry.id);
        return true;
      })
      .slice(0, 4);
  }

  private computeScore(input: string, item: AskGuruKnowledgeItem, contextId: string): number {
    const inputTokens = new Set(input.split(' ').filter(Boolean));
    let score = 0;

    for (const variation of item.questionVariations) {
      const normalizedVariation = this.normalize(variation);
      if (!normalizedVariation) continue;
      if (normalizedVariation === input) score += 120;
      else if (input.includes(normalizedVariation)) score += 60;
      else if (normalizedVariation.includes(input)) score += 42;
      else {
        const variationTokens = normalizedVariation.split(' ').filter(Boolean);
        const overlap = variationTokens.filter((token) => inputTokens.has(token)).length;
        score += overlap * 6;
      }
    }

    for (const keyword of item.keywords) {
      const normalizedKeyword = this.normalize(keyword);
      if (!normalizedKeyword) continue;
      if (inputTokens.has(normalizedKeyword)) score += 18;
      else if (input.includes(normalizedKeyword)) score += 8;
    }

    const normalizedTitle = this.normalize(item.title);
    const titleTokens = normalizedTitle.split(' ').filter(Boolean);
    score += titleTokens.filter((token) => inputTokens.has(token)).length * 5;
    if (this.itemIsRelevantToContext(item, contextId)) {
      score += 16;
    } else if ((item.pageTags?.length ?? 0) > 0) {
      score -= 14;
    }
    return score;
  }

  private normalize(value: string): string {
    return value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ');
  }
}
