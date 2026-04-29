import { Injectable, inject } from '@angular/core';
import {
  doc,
  getDoc,
  increment,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { getDownloadURL, ref as storageRef, uploadBytes, uploadBytesResumable } from 'firebase/storage';
import type {
  MemberOnboardingLink,
  MemberOnboardingLinkStatus,
  MemberOnboardingPrefill,
} from '../models/member-onboarding.model';
import { Member } from '../models/member.model';
import { AuditLogService } from './audit-log.service';
import { AuthService } from './auth.service';
import { FirebaseAppService } from './firebase-app.service';

/** Firestore collection paths for the onboarding flow. */
const TOKENS_COLLECTION = 'memberOnboardingLinks';
const SECRETS_COLLECTION = 'memberOnboardingLinkSecrets';

/** Link expiry — product spec: 1 day. */
const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

/** Lock the token after this many wrong-mobile attempts. */
const MAX_VERIFY_ATTEMPTS = 5;

/** Allowed image upload size, in bytes. */
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5 MB
/** Allowed image MIME types. */
const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp'];

export type OnboardingPhotoKind = 'profile' | 'aadhaarFront' | 'aadhaarBack';

export interface OnboardingPublicView {
  token: string;
  link: MemberOnboardingLink;
  member: Pick<
    Member,
    | 'firstName'
    | 'lastName'
    | 'email'
    | 'gender'
    | 'address'
    | 'aadhaarLast4'
    | 'aadhaarNumber'
    | 'profilePhotoUrl'
    | 'aadhaarFrontUrl'
    | 'aadhaarBackUrl'
    | 'selfOnboardingStatus'
  >;
  ownerBusinessName: string;
}

export interface OnboardingSubmitInput {
  email?: string;
  lastName?: string;
  gender?: Member['gender'] | '';
  address?: string;
  aadhaarNumber?: string;
  profilePhotoUrl?: string;
  aadhaarFrontUrl?: string;
  aadhaarBackUrl?: string;
}

/**
 * SECURITY MODEL (rules-only, no Cloud Functions):
 *
 *  - The link token is a 32-char random string (~190 bits) → unguessable.
 *  - The mobile-number check is a SECOND factor: the public client must POST a
 *    sha256 hash of `${token}:${mobile10digits}`. The actual hash is stored in a
 *    private companion doc that the public CANNOT read directly. Firestore rules
 *    use get() on that private doc to compare hashes server-side, so a brute-force
 *    attack would have to round-trip through Firestore (rate-limited).
 *  - After MAX_VERIFY_ATTEMPTS failed tries the token is locked.
 *  - Tokens expire 1 day after creation and become single-use after submission.
 */
@Injectable({ providedIn: 'root' })
export class MemberOnboardingService {
  private readonly fb = inject(FirebaseAppService);
  private readonly auth = inject(AuthService);
  private readonly audit = inject(AuditLogService);

  /* ------------------------- helpers ------------------------- */

  private tokenDocRef(token: string) {
    return doc(this.fb.db, TOKENS_COLLECTION, token);
  }

  private secretDocRef(token: string) {
    return doc(this.fb.db, SECRETS_COLLECTION, token);
  }

  /** Generate a URL-safe random token (~32 chars). */
  private generateToken(): string {
    const bytes = new Uint8Array(24);
    crypto.getRandomValues(bytes);
    let s = '';
    for (let i = 0; i < bytes.length; i += 1) {
      s += bytes[i].toString(16).padStart(2, '0');
    }
    return s;
  }

  /** Stable normalisation of an Indian mobile (digits only, last 10). */
  normalizeMobile(raw: string): string {
    return String(raw || '').replace(/\D/g, '').slice(-10);
  }

  /**
   * Hash mobile + token together via Web Crypto SHA-256.
   * Salt = token, so two members with the same mobile produce different hashes.
   */
  async hashMobileForToken(token: string, mobileRaw: string): Promise<string> {
    const mobile = this.normalizeMobile(mobileRaw);
    if (mobile.length !== 10) throw new Error('INVALID_MOBILE');
    const text = `${token}:${mobile}`;
    const buf = new TextEncoder().encode(text);
    const digest = await crypto.subtle.digest('SHA-256', buf);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  /** Public link the owner shares with the member. */
  buildShareUrl(token: string): string {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    return `${origin}/member-onboarding/${token}`;
  }

  /* ------------------------- owner side ------------------------- */

  /**
   * Issue a fresh onboarding link for a given member. If a previous active link
   * exists for this member, the owner can just call this again — the new token
   * supersedes the old one (we do NOT auto-revoke older tokens to avoid extra
   * reads; old tokens still expire in 24h on their own).
   */
  async generateLink(member: Member): Promise<{ token: string; url: string; expiresAt: Date }> {
    const owner = this.auth.profile();
    if (!owner || owner.role !== 'owner' || owner.status !== 'approved') {
      throw new Error('Only approved owners can generate onboarding links.');
    }
    if (member.ownerId !== owner.ownerId) {
      throw new Error('You can only share links for your own members.');
    }
    const mobile = this.normalizeMobile(member.mobile || '');
    if (mobile.length !== 10) {
      throw new Error("This member doesn't have a mobile number set. Add one and try again.");
    }

    const token = this.generateToken();
    const mobileHash = await this.hashMobileForToken(token, mobile);
    const now = Date.now();
    const expiresAt = new Date(now + TOKEN_TTL_MS);

    const prefill: MemberOnboardingPrefill = {
      firstName: member.firstName || '',
      lastName: member.lastName || '',
      email: member.email || '',
      gender:
        member.gender === 'male' || member.gender === 'female' || member.gender === 'other'
          ? member.gender
          : undefined,
      address: member.address || '',
      aadhaarNumber: member.aadhaarNumber || '',
      profilePhotoUrl: member.profilePhotoUrl || '',
      aadhaarFrontUrl: member.aadhaarFrontUrl || '',
      aadhaarBackUrl: member.aadhaarBackUrl || '',
      businessName: owner.businessName || owner.name || '',
    };
    // Strip undefined keys so Firestore accepts the doc.
    const cleanPrefill: Record<string, string> = {};
    for (const [k, v] of Object.entries(prefill)) {
      if (typeof v === 'string' && v.length > 0) cleanPrefill[k] = v;
    }

    const batch = writeBatch(this.fb.db);
    batch.set(this.tokenDocRef(token), {
      memberId: member.memberId,
      ownerId: owner.ownerId,
      status: 'active' satisfies MemberOnboardingLinkStatus,
      attempts: 0,
      createdAt: serverTimestamp(),
      expiresAt: Timestamp.fromDate(expiresAt),
      prefill: cleanPrefill,
    });
    batch.set(this.secretDocRef(token), {
      memberId: member.memberId,
      ownerId: owner.ownerId,
      mobileHash,
    });
    await batch.commit();

    await updateDoc(doc(this.fb.db, 'members', member.memberId), {
      onboardingLinkShareCount: increment(1),
    });

    const memberDisplay =
      `${(member.firstName || '').trim()} ${(member.lastName || '').trim()}`.trim() || 'Member';
    void this.audit.log({
      ownerId: owner.ownerId,
      action: 'member.profileLinkSent',
      entityType: 'member',
      entityId: member.memberId,
      entityLabel: memberDisplay,
      description: `Shared profile-update link with ${memberDisplay}.`,
      meta: {
        expiresAt: expiresAt.toISOString(),
        shareCount: String((member.onboardingLinkShareCount || 0) + 1),
      },
    });

    return { token, url: this.buildShareUrl(token), expiresAt };
  }

  async revokeLink(token: string): Promise<void> {
    const owner = this.auth.profile();
    if (!owner || owner.role !== 'owner') throw new Error('Not an owner');
    await updateDoc(this.tokenDocRef(token), {
      status: 'revoked' satisfies MemberOnboardingLinkStatus,
    });
  }

  /* ------------------------- public-side reads ------------------------- */

  /** Read the public token doc; throws if not found. */
  async readToken(token: string): Promise<MemberOnboardingLink> {
    const snap = await getDoc(this.tokenDocRef(token));
    if (!snap.exists()) throw new Error('LINK_NOT_FOUND');
    const data = snap.data() as Omit<MemberOnboardingLink, 'token'>;
    return { ...data, token };
  }

  /**
   * After the public client computed a mobile hash, it asks Firestore to mark
   * the token verified. The Firestore rule does the actual hash comparison via
   * get() on the private secrets doc; a wrong hash → permission-denied (and the
   * client increments the attempts counter as a separate write).
   */
  async tryVerifyMobile(token: string, mobileRaw: string): Promise<{ verified: boolean }> {
    const link = await this.readToken(token);
    if (link.status !== 'active') throw new Error('LINK_NOT_ACTIVE');
    if (link.expiresAt.toDate().getTime() <= Date.now()) throw new Error('LINK_EXPIRED');
    if ((link.attempts || 0) >= MAX_VERIFY_ATTEMPTS) throw new Error('LINK_LOCKED');

    const candidateHash = await this.hashMobileForToken(token, mobileRaw);
    try {
      // Rule check: only succeeds when candidateHash == stored mobileHash.
      await updateDoc(this.tokenDocRef(token), {
        verifiedAt: serverTimestamp(),
        verifyHashCheck: candidateHash,
      });
      return { verified: true };
    } catch {
      // Wrong mobile — record failed attempt (rule allows incrementing attempts).
      try {
        await updateDoc(this.tokenDocRef(token), {
          attempts: (link.attempts || 0) + 1,
        });
      } catch {
        // ignore secondary errors
      }
      return { verified: false };
    }
  }

  private validateImageFile(file: File): void {
    if (!ALLOWED_MIME.includes(file.type)) {
      throw new Error('Only JPG / PNG / WEBP images are allowed.');
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      throw new Error('Image too large. Please upload an image under 5 MB.');
    }
  }

  private extOf(file: File): string {
    const fromName = file.name.split('.').pop()?.toLowerCase();
    if (fromName && /^[a-z0-9]{2,5}$/.test(fromName)) return fromName;
    if (file.type === 'image/png') return 'png';
    if (file.type === 'image/webp') return 'webp';
    return 'jpg';
  }

  /**
   * Owner-side upload (signed-in). Writes go to `memberOnboarding/{memberId}/...`
   * which storage.rules restricts to the member's owner.
   */
  async uploadOwnerPhoto(
    memberId: string,
    kind: OnboardingPhotoKind,
    file: File,
  ): Promise<string> {
    this.validateImageFile(file);
    const path = `memberOnboarding/${memberId}/${kind}-${Date.now()}.${this.extOf(file)}`;
    const ref = storageRef(this.fb.storage, path);
    await uploadBytes(ref, file, { contentType: file.type });
    return getDownloadURL(ref);
  }

  /**
   * Public-side upload (no auth). Writes go to `memberOnboardingPublic/{token}/...`
   * which storage.rules restricts to active+verified tokens.
   */
  async uploadPublicPhoto(
    token: string,
    kind: OnboardingPhotoKind,
    file: File,
    onProgress?: (fraction01: number) => void,
  ): Promise<string> {
    this.validateImageFile(file);
    const path = `memberOnboardingPublic/${token}/${kind}.${this.extOf(file)}`;
    const ref = storageRef(this.fb.storage, path);
    const task = uploadBytesResumable(ref, file, { contentType: file.type });
    return await new Promise<string>((resolve, reject) => {
      task.on(
        'state_changed',
        (snap) => {
          const total = snap.totalBytes || file.size || 1;
          onProgress?.(Math.min(1, snap.bytesTransferred / total));
        },
        reject,
        () => {
          onProgress?.(1);
          void getDownloadURL(task.snapshot.ref).then(resolve).catch(reject);
        },
      );
    });
  }

  /**
   * Final submission. Updates the member doc with the public-allowed fields, then
   * marks the token as `used`. Both writes are individually gated by Firestore rules.
   */
  async submitOnboarding(
    token: string,
    memberId: string,
    payload: OnboardingSubmitInput,
  ): Promise<void> {
    const profilePhotoUrl = (payload.profilePhotoUrl || '').trim();
    const aadhaarFrontUrl = (payload.aadhaarFrontUrl || '').trim();
    const aadhaarBackUrl = (payload.aadhaarBackUrl || '').trim();
    if (!profilePhotoUrl || !aadhaarFrontUrl || !aadhaarBackUrl) {
      throw new Error('MISSING_PHOTOS');
    }

    const pending: Record<string, unknown> = {
      profilePhotoUrl,
      aadhaarFrontUrl,
      aadhaarBackUrl,
      email: (payload.email || '').trim(),
      lastName: (payload.lastName || '').trim(),
      address: (payload.address || '').trim(),
      aadhaarNumber: (payload.aadhaarNumber || '').trim(),
      submittedAt: serverTimestamp(),
      selfOnboardingTokenUsed: token,
    };
    if (payload.gender === 'male' || payload.gender === 'female' || payload.gender === 'other') {
      pending['gender'] = payload.gender;
    }

    await updateDoc(doc(this.fb.db, 'members', memberId), {
      pendingSelfOnboarding: pending,
      selfOnboardingStatus: 'pending_review',
      selfOnboardingTokenUsed: token,
    });

    await updateDoc(this.tokenDocRef(token), {
      status: 'used' satisfies MemberOnboardingLinkStatus,
      usedAt: serverTimestamp(),
    });
  }

  /** True when expiresAt is in the past or status is non-'active'. */
  isLinkOpenForUse(link: MemberOnboardingLink): boolean {
    if (link.status !== 'active') return false;
    if (!link.expiresAt) return false;
    return link.expiresAt.toDate().getTime() > Date.now();
  }
}
