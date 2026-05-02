import { Injectable, inject } from '@angular/core';
import {
  addDoc,
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Unsubscribe,
} from 'firebase/firestore';
import { AuditAction, AuditActorRole, AuditEntityType, AuditLog } from '../models/audit-log.model';
import { AuthService } from './auth.service';
import { FirebaseAppService } from './firebase-app.service';

/**
 * Caller-facing payload for a single audit-log entry.
 *
 * The service is responsible for stamping `performedBy*`, `timestamp`
 * and `createdAt` from the active session — callers never set them.
 */
export interface AuditLogInput {
  /** Owner the action belongs to (parent owner for supervisors). */
  ownerId: string;
  action: AuditAction;
  entityType: AuditEntityType;
  entityId?: string;
  entityLabel?: string;
  description: string;
  amount?: number;
  meta?: Record<string, string>;
}

/**
 * Audit-log writer + reader.
 *
 * Scope: every actor-driven mutation in the app (payments, member edits,
 * onboarding link generation, supervisor lifecycle, login, etc.) calls
 * `log()` so the owner has a single, tamper-resistant trail to reconcile
 * cash flow, dispute investigations, and supervisor activity.
 *
 * Storage: `owners/{ownerId}/auditLogs/{auditId}`.
 *
 * Failure mode: writes are best-effort. A failed audit write must NEVER
 * break the underlying business action (e.g. recording a payment). The
 * `log()` method swallows write errors, mirroring the pattern used by
 * `InAppNotificationService.addOwnerNotification`.
 */
@Injectable({ providedIn: 'root' })
export class AuditLogService {
  private readonly fb = inject(FirebaseAppService);
  private readonly auth = inject(AuthService);

  private auditCol(ownerId: string) {
    return collection(this.fb.db, 'owners', ownerId, 'auditLogs');
  }

  /**
   * Write a single audit row. Best-effort; never throws.
   *
   * Stamps `performedBy*` from the current session — the caller cannot
   * spoof those fields. The matching Firestore rule additionally enforces
   * `performedBy == request.auth.uid` so a malicious supervisor cannot
   * write a row attributed to the owner.
   */
  async log(input: AuditLogInput): Promise<void> {
    if (!input.ownerId) return;
    const uid = this.auth.user()?.uid ?? '';
    if (!uid) return;
    const profile = this.auth.profile();
    const role: AuditActorRole =
      profile?.role === 'admin'
        ? 'admin'
        : profile?.role === 'supervisor'
          ? 'supervisor'
          : 'owner';
    const performedByName = (profile?.name || profile?.email || '').trim() || 'Unknown';

    const payload: Record<string, unknown> = {
      ownerId: input.ownerId,
      action: input.action,
      entityType: input.entityType,
      description: (input.description || '').slice(0, 600),
      performedBy: uid,
      performedByName: performedByName.slice(0, 200),
      performedByRole: role,
      timestamp: serverTimestamp(),
      createdAt: serverTimestamp(),
    };
    if (input.entityId) payload['entityId'] = input.entityId;
    if (input.entityLabel) payload['entityLabel'] = input.entityLabel.slice(0, 200);
    if (typeof input.amount === 'number' && Number.isFinite(input.amount)) {
      payload['amount'] = Math.max(0, input.amount);
    }
    if (input.meta && Object.keys(input.meta).length) {
      payload['meta'] = input.meta;
    }
    if (profile?.role === 'supervisor') {
      // The friendly supervisor `userId` (e.g. "ramesh01") is more useful in
      // the owner's audit table than a random Firebase UID. The auth profile
      // is projected from the supervisor doc (which DOES carry `userId`)
      // but the typed `Owner` model doesn't expose it, so we read defensively.
      const supervisorUserId = (profile as unknown as Record<string, unknown>)['userId'];
      if (typeof supervisorUserId === 'string' && supervisorUserId.length > 0) {
        payload['performedByLabel'] = supervisorUserId;
      } else {
        payload['performedByLabel'] = uid.slice(0, 12);
      }
    } else if (profile?.ownerId) {
      payload['performedByLabel'] = profile.ownerId.slice(0, 12);
    }

    try {
      await addDoc(this.auditCol(input.ownerId), payload);
    } catch (e) {
      // Swallow: a missing audit row must NEVER break the underlying
      // action. We log to the console so devs can spot rule mis-configs.
      console.warn('[audit-log] failed to write row', { action: input.action, error: e });
    }
  }

  /**
   * Live-watch the audit trail for an owner, newest-first.
   *
   * Default cap of 500 rows balances "show enough history" with a
   * reasonable Firestore listener footprint for active accounts.
   */
  watchLogs(
    ownerId: string,
    callback: (rows: AuditLog[]) => void,
    cap = 500,
  ): Unsubscribe {
    const q = query(this.auditCol(ownerId), orderBy('timestamp', 'desc'), limit(cap));
    return onSnapshot(
      q,
      (snap) => {
        const rows: AuditLog[] = [];
        snap.forEach((d) => {
          const data = d.data() as Record<string, unknown>;
          rows.push({
            id: d.id,
            ownerId: String(data['ownerId'] ?? ownerId),
            action: data['action'] as AuditAction,
            entityType: (data['entityType'] as AuditEntityType) || 'system',
            entityId: typeof data['entityId'] === 'string' ? (data['entityId'] as string) : undefined,
            entityLabel:
              typeof data['entityLabel'] === 'string' ? (data['entityLabel'] as string) : undefined,
            description: String(data['description'] ?? ''),
            amount:
              typeof data['amount'] === 'number' ? (data['amount'] as number) : undefined,
            meta:
              data['meta'] && typeof data['meta'] === 'object'
                ? (data['meta'] as Record<string, string>)
                : undefined,
            performedBy: String(data['performedBy'] ?? ''),
            performedByName: String(data['performedByName'] ?? ''),
            performedByRole: (data['performedByRole'] as AuditActorRole) || 'owner',
            performedByLabel:
              typeof data['performedByLabel'] === 'string'
                ? (data['performedByLabel'] as string)
                : undefined,
            timestamp: data['timestamp'] as AuditLog['timestamp'],
            createdAt: data['createdAt'] as AuditLog['createdAt'],
          });
        });
        callback(rows);
      },
      (error) => {
        console.error('[audit-log] listener error', error);
      },
    );
  }
}
