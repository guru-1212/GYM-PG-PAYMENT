import { Routes } from '@angular/router';
import { accountRejectedGuard } from './core/guards/account-rejected.guard';
import { adminGuard } from './core/guards/admin.guard';
import { authGuard } from './core/guards/auth.guard';
import { loginGuard } from './core/guards/login.guard';
import { ownerGuard } from './core/guards/owner.guard';
import { pendingApprovalGuard } from './core/guards/pending-approval.guard';
import {
  auditLogFeatureGuard,
  noSupervisorGuard,
  permissionGuard,
  supervisorFeatureGuard,
  tenantMemberAppFeatureGuard,
} from './core/guards/permission.guard';
import { subscriptionGuard } from './core/guards/subscription.guard';
import { supervisorShellGuard } from './core/guards/supervisor-shell.guard';
import { memberAppHomeGuard } from './core/guards/member-app.guard';
import { AdminShellComponent } from './layout/admin-shell.component';
import { OwnerShellComponent } from './layout/owner-shell.component';
import { SupervisorShellComponent } from './layout/supervisor-shell.component';
import { AccountRejectedComponent } from './pages/account-rejected/account-rejected.component';
import { AdminDashboardComponent } from './pages/admin/admin-dashboard.component';
import { AdminOwnersComponent } from './pages/admin/admin-owners.component';
import { HomeComponent } from './pages/home/home.component';
import { OwnerDashboardComponent } from './pages/dashboard/owner-dashboard.component';
import { LoginComponent } from './pages/login/login.component';
import { MemberOnboardingComponent } from './pages/member-onboarding/member-onboarding.component';
import { MemberReceiptComponent } from './pages/member-receipt/member-receipt.component';
import { MembersComponent } from './pages/members/members.component';
import { PaymentsPageComponent } from './pages/payments/payments-page.component';
import { PendingApprovalComponent } from './pages/pending-approval/pending-approval.component';
import { RoomsPageComponent } from './pages/rooms/rooms-page.component';
import { MonthlyEarningsPageComponent } from './pages/monthly-earnings/monthly-earnings-page.component';
import { SubscriptionExpiredComponent } from './pages/subscription-expired/subscription-expired.component';
import { SupervisorDashboardComponent } from './pages/supervisor-dashboard/supervisor-dashboard.component';
import { ComplaintsPageComponent } from './pages/complaints/complaints-page.component';

export const routes: Routes = [
  { path: '', pathMatch: 'full', component: HomeComponent },
  { path: 'login', canActivate: [loginGuard], component: LoginComponent },
  {
    path: 'forgot-password',
    loadComponent: () =>
      import('./pages/forgot-password/forgot-password.component').then(
        (m) => m.ForgotPasswordComponent,
      ),
  },
  {
    path: 'pending-approval',
    canActivate: [authGuard, pendingApprovalGuard],
    component: PendingApprovalComponent,
  },
  {
    path: 'account-rejected',
    canActivate: [authGuard, accountRejectedGuard],
    component: AccountRejectedComponent,
  },
  {
    path: 'subscription-expired',
    canActivate: [authGuard],
    component: SubscriptionExpiredComponent,
  },
  /** Public complaint form — no login; owner shares `/complaint/{ownerId}` or QR from dashboard. */
  {
    path: 'complaint/:ownerId',
    loadComponent: () =>
      import('./pages/public-complaint/public-complaint-page.component').then(
        (m) => m.PublicComplaintPageComponent,
      ),
  },
  /** Public onboarding link a member receives to fill in their own details. */
  { path: 'member-onboarding/:token', component: MemberOnboardingComponent },
  /** Pre–add-member: member submits basics; owner completes bed / payment in Add member. */
  {
    path: 'join-intake/:token',
    loadComponent: () =>
      import('./pages/member-join-intake/member-join-intake-page.component').then(
        (m) => m.MemberJoinIntakePageComponent,
      ),
  },
  /** Public receipt link a member receives to download their payment receipt. */
  { path: 'member-receipt/:token', component: MemberReceiptComponent },
  /** PWA `start_url` — routes tenants away from the public marketing home page. */
  {
    path: 'member-app/entry',
    loadComponent: () =>
      import('./pages/member-app/member-app-entry.component').then((m) => m.MemberAppEntryComponent),
  },
  /** Tenant sign-in hub (restores install URL from localStorage when possible). */
  {
    path: 'member-app/login',
    loadComponent: () =>
      import('./pages/member-app/member-app-login.component').then((m) => m.MemberAppLoginComponent),
  },
  {
    path: 'member-app/install/:code',
    loadComponent: () =>
      import('./pages/member-app/member-app-install.component').then((m) => m.MemberAppInstallComponent),
  },
  {
    path: 'member-app/home',
    canActivate: [memberAppHomeGuard],
    loadComponent: () =>
      import('./pages/member-app/member-app-home.component').then((m) => m.MemberAppHomeComponent),
  },
  {
    path: 'admin',
    canActivate: [authGuard, adminGuard],
    component: AdminShellComponent,
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      { path: 'dashboard', component: AdminDashboardComponent },
      { path: 'owners', component: AdminOwnersComponent },
    ],
  },
  /**
   * Supervisor shell — completely independent route tree from owner shell.
   *
   * Reuses Members / Payments / Rooms components because the data scope is
   * still the parent owner (supervisor.profile.ownerId === parentOwnerId).
   * Permission guards on each leaf route enforce the per-account flags.
   * `subscriptionGuard` runs because supervisors inherit the parent owner's
   * plan (auth merges parent.planEndDate into the supervisor profile).
   */
  {
    path: 'supervisor',
    canActivate: [authGuard, supervisorShellGuard, subscriptionGuard],
    component: SupervisorShellComponent,
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      { path: 'dashboard', component: SupervisorDashboardComponent },
      {
        path: 'members',
        canActivate: [permissionGuard('canViewMembers')],
        component: MembersComponent,
      },
      {
        path: 'inactive-members',
        canActivate: [permissionGuard('canViewInactiveMembers')],
        component: MembersComponent,
      },
      {
        path: 'payments',
        canActivate: [permissionGuard('canViewPayments')],
        component: PaymentsPageComponent,
      },
      {
        path: 'rooms',
        canActivate: [permissionGuard('canViewRooms')],
        component: RoomsPageComponent,
      },
    ],
  },
  {
    path: '',
    canActivate: [authGuard, ownerGuard, subscriptionGuard],
    component: OwnerShellComponent,
    children: [
      { path: 'dashboard', component: OwnerDashboardComponent },
      {
        path: 'members',
        canActivate: [permissionGuard('canViewMembers')],
        component: MembersComponent,
      },
      {
        path: 'inactive-members',
        canActivate: [permissionGuard('canViewInactiveMembers')],
        component: MembersComponent,
      },
      {
        path: 'payments',
        canActivate: [permissionGuard('canViewPayments')],
        component: PaymentsPageComponent,
      },
      {
        path: 'rooms',
        canActivate: [permissionGuard('canViewRooms')],
        component: RoomsPageComponent,
      },
      {
        path: 'monthly-earnings',
        canActivate: [noSupervisorGuard],
        component: MonthlyEarningsPageComponent,
      },
      {
        path: 'supervisors',
        canActivate: [supervisorFeatureGuard],
        loadComponent: () =>
          import('./pages/supervisors/supervisors-page.component').then(
            (m) => m.SupervisorsPageComponent,
          ),
      },
      {
        path: 'analytics',
        canActivate: [noSupervisorGuard],
        loadComponent: () =>
          import('./pages/analytics/analytics-page.component').then(
            (m) => m.AnalyticsPageComponent,
          ),
      },
      {
        path: 'audit-log',
        canActivate: [auditLogFeatureGuard],
        loadComponent: () =>
          import('./pages/audit-log/audit-log-page.component').then(
            (m) => m.AuditLogPageComponent,
          ),
      },
      /**
       * Member App QR generator + broadcast hub.
       * Owner-only; supervisors don't issue install codes.
       */
      {
        path: 'member-app-qr',
        canActivate: [noSupervisorGuard, tenantMemberAppFeatureGuard],
        loadComponent: () =>
          import('./pages/owner-notify-members/owner-notify-members-page.component').then(
            (m) => m.OwnerNotifyMembersPageComponent,
          ),
      },
      // Legacy redirect — anything that linked to /notify-members lands on the new page.
      { path: 'notify-members', redirectTo: 'member-app-qr', pathMatch: 'full' },
      {
        path: 'notifications',
        loadComponent: () =>
          import('./pages/owner-notifications/owner-notifications-page.component').then(
            (m) => m.OwnerNotificationsPageComponent,
          ),
      },
      {
        path: 'complaints',
        canActivate: [noSupervisorGuard],
        component: ComplaintsPageComponent,
      },
    ],
  },
  { path: '**', redirectTo: 'login' },
];
