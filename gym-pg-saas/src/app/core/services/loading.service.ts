import { Injectable, signal } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class LoadingService {
  private readonly loadingCount = signal(0);
  readonly isLoading = signal(false);

  /**
   * Show loading indicator - call this before starting async operations
   */
  show(): void {
    this.loadingCount.update(count => count + 1);
    this.isLoading.set(true);
  }

  /**
   * Hide loading indicator - call this after async operations complete
   */
  hide(): void {
    this.loadingCount.update(count => Math.max(0, count - 1));
    if (this.loadingCount() === 0) {
      this.isLoading.set(false);
    }
  }

  /**
   * Execute an async operation with automatic loading state management
   */
  async withLoading<T>(operation: () => Promise<T>): Promise<T> {
    this.show();
    try {
      return await operation();
    } finally {
      this.hide();
    }
  }
}
