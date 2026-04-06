import { Injectable } from '@angular/core';
import { initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class FirebaseAppService {
  readonly app: FirebaseApp;
  readonly auth: Auth;
  readonly db: Firestore;

  constructor() {
    this.app = initializeApp(environment.firebase);
    this.auth = getAuth(this.app);
    this.db = getFirestore(this.app);
  }
}
