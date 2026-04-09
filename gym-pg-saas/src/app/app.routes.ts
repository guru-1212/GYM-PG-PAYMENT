import { Routes } from '@angular/router';
import { accountRejectedGuard } from './core/guards/account-rejected.guard';
import { adminGuard } from './core/guards/admin.guard';
import { authGuard } from './core/guards/auth.guard';
import { loginGuard } from './core/guards/login.guard';
import { ownerGuard } from './core/guards/owner.guard';
import { pendingApprovalGuard } from './core/guards/pending-approval.guard';
import { subscriptionGuard } from './core/guards/subscription.guard';
import { AdminShellComponent } from './layout/admin-shell.component';
import { OwnerShellComponent } from './layout/owner-shell.component';
import { AccountRejectedComponent } from './pages/account-rejected/account-rejected.component';
import { AdminDashboardComponent } from './pages/admin/admin-dashboard.component';
import { AdminOwnersComponent } from './pages/admin/admin-owners.component';
import { HomeComponent } from './pages/home/home.component';
import { OwnerDashboardComponent } from './pages/dashboard/owner-dashboard.component';
import { LoginComponent } from './pages/login/login.component';
import { MembersComponent } from './pages/members/members.component';
import { PaymentsPageComponent } from './pages/payments/payments-page.component';
import { PendingApprovalComponent } from './pages/pending-approval/pending-approval.component';
import { RoomsPageComponent } from './pages/rooms/rooms-page.component';
import { MonthlyEarningsPageComponent } from './pages/monthly-earnings/monthly-earnings-page.component';
import { SubscriptionExpiredComponent } from './pages/subscription-expired/subscription-expired.component';

export const routes: Routes = [
  { path: '', pathMatch: 'full', component: HomeComponent },
  { path: 'login', canActivate: [loginGuard], component: LoginComponent },
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
  {
    path: '',
    canActivate: [authGuard, ownerGuard, subscriptionGuard],
    component: OwnerShellComponent,
    children: [
      { path: 'dashboard', component: OwnerDashboardComponent },
      { path: 'members', component: MembersComponent },
      { path: 'payments', component: PaymentsPageComponent },
      { path: 'rooms', component: RoomsPageComponent },
      { path: 'monthly-earnings', component: MonthlyEarningsPageComponent },
    ],
  },
  { path: '**', redirectTo: 'login' },
];
