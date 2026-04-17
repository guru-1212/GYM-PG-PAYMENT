import { inject } from '@angular/core';
import { Routes, Router } from '@angular/router';
import { accountRejectedGuard } from './core/guards/account-rejected.guard';
import { adminGuard } from './core/guards/admin.guard';
import { authGuard } from './core/guards/auth.guard';
import { loginGuard } from './core/guards/login.guard';
import { ownerGuard } from './core/guards/owner.guard';
import { pendingApprovalGuard } from './core/guards/pending-approval.guard';
import { subscriptionGuard } from './core/guards/subscription.guard';
import { AuthService } from './core/services/auth.service';
import { PermissionService } from './core/services/permission.service';
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
import { OwnerControlComponent } from './pages/admin/owner-control/owner-control.component';
import { WorkerControlComponent } from './pages/worker-control/worker-control.component';
// Complaints feature temporarily disabled — re-enable imports + routes when fixed.
// import { PublicComplaintPageComponent } from './pages/public-complaint/public-complaint-page.component';
// import { ComplaintsPageComponent } from './pages/complaints/complaints-page.component';

const workerPermissionGuard = (route: any, state: any) => {
  const auth = inject(AuthService);
  const permission = inject(PermissionService);
  const router = inject(Router);
  if (!auth.isWorker()) return true;
  const targetPath = route.routeConfig?.path || state.url;
  if (permission.canAccessRoute(targetPath)) return true;
  return router.createUrlTree([permission.firstAccessibleRoute()]);
};

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
  /* Complaints disabled: was PublicComplaintPageComponent */
  { path: 'complaint/:ownerId', component: HomeComponent },
  {
    path: 'admin',
    canActivate: [authGuard, adminGuard],
    component: AdminShellComponent,
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      { path: 'dashboard', component: AdminDashboardComponent },
      { path: 'owners', component: AdminOwnersComponent },
      { path: 'owners-control', component: OwnerControlComponent },
    ],
  },
  {
    path: '',
    canActivate: [authGuard, ownerGuard, subscriptionGuard],
    component: OwnerShellComponent,
    children: [
      { path: 'dashboard', canActivate: [workerPermissionGuard], component: OwnerDashboardComponent },
      { path: 'members', canActivate: [workerPermissionGuard], component: MembersComponent },
      { path: 'inactive-members', canActivate: [workerPermissionGuard], component: MembersComponent },
      { path: 'payments', canActivate: [workerPermissionGuard], component: PaymentsPageComponent },
      { path: 'rooms', canActivate: [workerPermissionGuard], component: RoomsPageComponent },
      { path: 'monthly-earnings', canActivate: [workerPermissionGuard], component: MonthlyEarningsPageComponent },
      { path: 'workers', canActivate: [workerPermissionGuard], component: WorkerControlComponent },
      /* Complaints disabled: was ComplaintsPageComponent */
      { path: 'complaints', redirectTo: 'dashboard', pathMatch: 'full' },
    ],
  },
  { path: '**', redirectTo: 'login' },
];
