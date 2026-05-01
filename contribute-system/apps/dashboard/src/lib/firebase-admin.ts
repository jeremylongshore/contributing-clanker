/**
 * Firebase Admin SDK for Server-Side Operations
 *
 * Used in API routes for Firestore operations.
 * Requires GOOGLE_APPLICATION_CREDENTIALS or explicit service account.
 */

import { initializeApp, getApps, cert, App } from 'firebase-admin/app';
import { getFirestore, Firestore } from 'firebase-admin/firestore';

let app: App | undefined;
let adminDb: Firestore | undefined;

function getAdminApp(): App {
  if (!app) {
    const existingApps = getApps();
    if (existingApps.length > 0) {
      app = existingApps[0];
    } else {
      // Initialize with default credentials (GOOGLE_APPLICATION_CREDENTIALS)
      // or explicit project ID for Cloud Run/Firebase environments
      const projectId = process.env.GOOGLE_CLOUD_PROJECT ||
                        process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
                        'intentional-bounty';

      app = initializeApp({
        projectId,
      });
    }
  }
  return app;
}

export function getAdminDb(): Firestore {
  if (!adminDb) {
    adminDb = getFirestore(getAdminApp());
  }
  return adminDb;
}

// Collection names
export const COLLECTIONS = {
  NOTIFICATIONS: 'notifications',
  NOTIFICATION_PREFERENCES: 'notificationPreferences',
  AUTOMATION_RULES: 'automationRules',
  AUTOMATION_LOGS: 'automationLogs',
} as const;
