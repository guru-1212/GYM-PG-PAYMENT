import { Injectable, inject } from '@angular/core';
import {
  collection,
  doc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { AuthService } from './auth.service';
import { FirebaseAppService } from './firebase-app.service';

function randomToken(len = 28): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const arr = new Uint8Array(len);
  crypto.getRandomValues(arr);
  let s = '';
  for (let i = 0; i < len; i += 1) s += alphabet[arr[i] % alphabet.length];
  return s;
}

@Injectable({ providedIn: 'root' })
export class MemberInstallQrService {
  private readonly fb = inject(FirebaseAppService);
  private readonly auth = inject(AuthService);

  private installOrigin(): string {
    return typeof window !== 'undefined' ? window.location.origin : '';
  }

  /**
   * One stable install link per owner: reuse the first active `memberInstallQrCodes` doc for this owner.
   * Creates a code only when none exists (members should not reinstall when the owner clicks again).
   */
  async getOrCreateInstallLink(): Promise<{ code: string; installUrl: string; created: boolean }> {
    const owner = this.auth.profile();
    if (!owner || owner.role !== 'owner' || owner.status !== 'approved') {
      throw new Error('Only approved owners can use the member app install link.');
    }
    const oid = owner.ownerId;
    const q = query(
      collection(this.fb.db, 'memberInstallQrCodes'),
      where('ownerId', '==', oid),
      where('active', '==', true),
      limit(1),
    );
    const existing = await getDocs(q);
    if (!existing.empty) {
      const code = existing.docs[0].id;
      return {
        code,
        installUrl: `${this.installOrigin()}/member-app/install/${code}`,
        created: false,
      };
    }
    const code = randomToken(28);
    await setDoc(doc(this.fb.db, 'memberInstallQrCodes', code), {
      ownerId: oid,
      active: true,
      createdAt: serverTimestamp(),
    });
    return {
      code,
      installUrl: `${this.installOrigin()}/member-app/install/${code}`,
      created: true,
    };
  }

  async deactivateCode(code: string): Promise<void> {
    const owner = this.auth.profile();
    if (!owner || owner.role !== 'owner') throw new Error('Not allowed');
    const ref = doc(this.fb.db, 'memberInstallQrCodes', code);
    await updateDoc(ref, { active: false });
  }
}
