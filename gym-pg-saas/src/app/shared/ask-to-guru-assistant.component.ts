import { CommonModule } from '@angular/common';
import { AfterViewChecked, Component, ElementRef, ViewChild, computed, inject, signal } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { AuthService } from '../core/services/auth.service';
import { AskGuruSuggestion } from '../core/models/ask-guru.model';
import { AskGuruAssistantService } from '../core/services/ask-guru-assistant.service';

const ADMIN_WHATSAPP_NUMBER = '916300675014';

type AskGuruMessage = {
  id: string;
  sender: 'assistant' | 'user';
  text: string;
  highlight?: boolean;
  suggestions?: AskGuruSuggestion[];
  showStillHelpButton?: boolean;
  showContactAdmin?: boolean;
};

@Component({
  selector: 'app-ask-to-guru-assistant',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './ask-to-guru-assistant.component.html',
  styleUrl: './ask-to-guru-assistant.component.scss',
})
export class AskToGuruAssistantComponent implements AfterViewChecked {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly assistantService = inject(AskGuruAssistantService);
  @ViewChild('chatViewport') private chatViewport?: ElementRef<HTMLDivElement>;

  readonly profile = this.auth.profile;
  readonly ownerDisplayName = computed(() => {
    const p = this.profile();
    return p?.name?.trim() || p?.businessName?.trim() || 'there';
  });
  readonly panelOpen = signal(false);
  readonly messages = signal<AskGuruMessage[]>([]);
  readonly inputText = signal('');
  readonly isTyping = signal(false);
  readonly lastAskedQuestion = signal('');
  readonly currentPageTitle = signal('this page');
  private greetedContextId = signal<string | null>(null);
  private needsScroll = false;
  private readonly routeWatcher = this.router.events.subscribe((event) => {
    if (!(event instanceof NavigationEnd)) return;
    if (!this.panelOpen()) return;
    void this.ensureSessionReady();
  });

  ngAfterViewChecked(): void {
    if (!this.needsScroll) return;
    const viewport = this.chatViewport?.nativeElement;
    if (!viewport) return;
    viewport.scrollTo({ top: viewport.scrollHeight, behavior: 'smooth' });
    this.needsScroll = false;
  }

  async openAssistant(): Promise<void> {
    this.panelOpen.set(true);
    await this.ensureSessionReady();
  }

  closeAssistant(): void {
    this.panelOpen.set(false);
  }

  async sendCurrentQuestion(): Promise<void> {
    const question = this.inputText().trim();
    if (!question || this.isTyping()) return;
    this.inputText.set('');
    await this.handleQuestion(question);
  }

  async askSuggestion(suggestion: AskGuruSuggestion): Promise<void> {
    if (this.isTyping()) return;
    await this.handleQuestion(suggestion.query);
  }

  async contactAdminOnWhatsapp(): Promise<void> {
    const ownerName = this.ownerDisplayName();
    const question = this.lastAskedQuestion().trim() || 'I need help with app usage.';
    const lines = [
      `Hi, I am ${ownerName}.`,
      `My question is: ${question}`,
      'Can you please help me with this?',
    ];
    const text = encodeURIComponent(lines.join('\n'));
    const url = `https://wa.me/${ADMIN_WHATSAPP_NUMBER}?text=${text}`;
    const opened = window.open(url, '_blank', 'noopener,noreferrer');
    if (!opened) {
      window.location.assign(url);
    }
  }

  showContactOption(messageId: string): void {
    this.messages.update((rows) =>
      rows.map((row) => (row.id === messageId ? { ...row, showContactAdmin: true } : row)),
    );
  }

  private async ensureSessionReady(): Promise<void> {
    const result = await this.assistantService.initialSuggestions(this.router.url);
    this.currentPageTitle.set(result.context.title);
    if (this.greetedContextId() === result.context.id) return;
    this.greetedContextId.set(result.context.id);
    this.pushMessage({
      id: this.newId('greeting'),
      sender: 'assistant',
      text: `Hi ${this.ownerDisplayName()} 👋\nYou are on ${result.context.title}.\n${result.context.intro}`,
      suggestions: result.suggestions,
    });
  }

  private async handleQuestion(question: string): Promise<void> {
    this.lastAskedQuestion.set(question);
    this.pushMessage({
      id: this.newId('user'),
      sender: 'user',
      text: question,
    });
    this.isTyping.set(true);

    const result = await this.assistantService.matchQuestion(question, this.router.url);
    const delay = 500 + Math.floor(Math.random() * 500);
    await new Promise<void>((resolve) => {
      window.setTimeout(() => resolve(), delay);
    });

    this.isTyping.set(false);
    if (result.item) {
      const msgId = this.newId('assistant');
      this.pushMessage({
        id: msgId,
        sender: 'assistant',
        text: result.item.answer,
        highlight: true,
        suggestions: result.suggestions,
      });
      window.setTimeout(() => {
        this.messages.update((rows) =>
          rows.map((row) => (row.id === msgId ? { ...row, highlight: false } : row)),
        );
      }, 1700);
      return;
    }

    this.pushMessage({
      id: this.newId('assistant-fallback'),
      sender: 'assistant',
      text: "I'm not fully sure about that yet 🤔\nHere are some things I can help with:",
      suggestions: result.suggestions,
      showStillHelpButton: true,
    });
  }

  private pushMessage(message: AskGuruMessage): void {
    this.messages.update((rows) => [...rows, message]);
    this.needsScroll = true;
  }

  private newId(prefix: string): string {
    return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  }
}
