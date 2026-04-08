import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-brand-logo',
  standalone: true,
  template: `
    <div class="flex items-center gap-2">
     
      @if (showText) {
        <span class="brand-name">{{ brandName }}</span>
      }
    </div>
  `,
  styles: [`
    :host {
      display: flex;
      align-items: center;
    }
    .brand-logo {
      flex-shrink: 0;
    }
    .brand-name {
      font-weight: 600;
      background: linear-gradient(to right, #3b82f6, #4f46e5);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
      font-size: 24px;
    }
  `]
})
export class BrandLogoComponent {
  @Input() logoSize = '32px';
  @Input() showText = false;
  @Input() brandName = 'OurPgTracker';
}
