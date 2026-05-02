export interface AskGuruKnowledgeItem {
  id: string;
  title: string;
  questionVariations: string[];
  keywords: string[];
  answer: string;
  quickActionLabel?: string;
  relatedSuggestionIds?: string[];
  pageTags?: string[];
}

export interface AskGuruPageContext {
  id: string;
  title: string;
  routePatterns: string[];
  intro: string;
  suggestionIds?: string[];
}

export interface AskGuruKnowledgePayload {
  pageContexts: AskGuruPageContext[];
  items: AskGuruKnowledgeItem[];
}

export interface AskGuruSuggestion {
  id: string;
  label: string;
  query: string;
}

export interface AskGuruMatchResult {
  item: AskGuruKnowledgeItem | null;
  score: number;
  suggestions: AskGuruSuggestion[];
}
