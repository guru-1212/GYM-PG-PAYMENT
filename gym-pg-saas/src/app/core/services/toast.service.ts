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

  success(message: string): void {
    this.push(message, 'success');
  }

  error(message: string): void {
    this.push(message, 'error');
  }

  private push(message: string, kind: ToastKind): void {
    const id = ++this.id;
    this.toasts.update((list) => [...list, { id, message, kind }]);
    setTimeout(() => this.dismiss(id), 4500);
  }

  dismiss(id: number): void {
    this.toasts.update((list) => list.filter((t) => t.id !== id));
  }
}
