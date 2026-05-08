import { Component, inject, signal, DestroyRef, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-offline-banner',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './offline-banner.component.html',
  styleUrl: './offline-banner.component.scss',
})
export class OfflineBannerComponent implements OnInit {
  private readonly destroyRef = inject(DestroyRef);
  
  readonly isOffline = signal(false);
  readonly isVisible = signal(false);

  ngOnInit(): void {
    // Check initial status
    this.isOffline.set(!navigator.onLine);
    
    if (this.isOffline()) {
      this.isVisible.set(true);
    }

    // Listen for online/offline events
    const handleOnline = () => {
      this.isOffline.set(false);
      // Auto-hide after 3 seconds when back online
      setTimeout(() => {
        this.isVisible.set(false);
      }, 3000);
    };

    const handleOffline = () => {
      this.isOffline.set(true);
      this.isVisible.set(true);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Cleanup on destroy
    this.destroyRef.onDestroy(() => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    });
  }

  dismiss(): void {
    this.isVisible.set(false);
  }
}
