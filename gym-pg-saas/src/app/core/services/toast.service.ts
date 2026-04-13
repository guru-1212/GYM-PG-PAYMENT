import { Injectable, signal } from '@angular/core';

export type ToastKind = 'success' | 'error';

export interface ToastMessage {
  id: number;
  message: string;
  kind: ToastKind;
}

@Injectable({ providedIn: 'root' })
export class ToastService {
  private id = 0;
  readonly toasts = signal<ToastMessage[]>([]);

  success(message: string, durationMs?: number): void {
    this.push(message, 'success', durationMs ?? 4500);
  }

  error(message: string, durationMs?: number): void {
    this.push(message, 'error', durationMs ?? 4500);
  }

  private push(message: string, kind: ToastKind, durationMs: number): void {
    const id = ++this.id;
    this.toasts.update((list) => [...list, { id, message, kind }]);
    setTimeout(() => this.dismiss(id), durationMs);
  }

  dismiss(id: number): void {
    this.toasts.update((list) => list.filter((t) => t.id !== id));
  }
}
