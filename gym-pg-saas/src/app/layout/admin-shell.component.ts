import { Component, HostListener, computed, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../core/services/auth.service';
import { NotificationService } from '../core/services/notification.service';
import { TranslationService } from '../core/services/translation.service';
import { TranslatePipe } from '../shared/pipes/translate.pipe';
import { BrandLogoComponent } from '../shared/brand-logo.component';
import { ThemeToggleComponent } from '../shared/theme-toggle.component';
import { ThemePickerComponent } from '../shared/theme-picker.component';

@Component({
  selector: 'app-admin-shell',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, TranslatePipe, BrandLogoComponent, ThemeToggleComponent, ThemePickerComponent],
  templateUrl: './admin-shell.component.html',
})
export class AdminShellComponent {
  private readonly auth = inject(AuthService);
  private readonly notifications = inject(NotificationService);
  private readonly router = inject(Router);
  readonly i18n = inject(TranslationService);

  readonly profile = this.auth.profile;
  readonly adminInitial = computed(() => {
    const n = this.profile()?.name?.trim();
    if (!n) return '?';
    return n.charAt(0).toUpperCase();
  });

  readonly mobileMenuOpen = signal(false);
  readonly userMenuOpen = signal(false);

  constructor() {
    this.notifications.requestPermissionOnce();
  }

  openMobileMenu(): void {
    this.closeUserMenu();
    this.mobileMenuOpen.set(true);
  }

  closeMobileMenu(): void {
    this.mobileMenuOpen.set(false);
  }

  toggleUserMenu(event: MouseEvent): void {
    event.stopPropagation();
    this.userMenuOpen.update((v) => !v);
  }

  closeUserMenu(): void {
    this.userMenuOpen.set(false);
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(ev: MouseEvent): void {
    const el = ev.target as HTMLElement | null;
    if (el?.closest('[data-admin-user-menu-root]')) return;
    this.userMenuOpen.set(false);
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.mobileMenuOpen()) this.closeMobileMenu();
    if (this.userMenuOpen()) this.closeUserMenu();
  }

  async signOut(): Promise<void> {
    this.closeMobileMenu();
    this.closeUserMenu();
    await this.auth.signOut();
    await this.router.navigateByUrl('/login');
  }
}
