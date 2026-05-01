'use client';

/**
 * Proofs Hook
 *
 * Real-time Firestore listener for proofs collection.
 */

import { useState, useEffect } from 'react';
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  where
} from 'firebase/firestore';
import { getFirebaseDb } from '../firebase';

export interface Proof {
  id: string;
  bountyId: string;
  sessions: string[];
  recordings: Array<{
    id: string;
    url: string;
    duration: number;
    timestamp: string;
  }>;
  screenshots: string[];
  checkpoints: number;
  linesAdded: number;
  linesDeleted: number;
  filesChanged: number;
  createdAt: string;
  vetting?: {
    status: 'passed' | 'failed';
    stages: number;
    passed: number;
    failed: number;
  };
}

export function useProofs(bountyId?: string) {
  const [proofs, setProofs] = useState<Proof[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const db = getFirebaseDb();
    let q = query(collection(db, 'proofs'), orderBy('createdAt', 'desc'));

    if (bountyId) {
      q = query(
        collection(db, 'proofs'),
        where('bountyId', '==', bountyId),
        orderBy('createdAt', 'desc')
      );
    }

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const data = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as Proof[];

        setProofs(data);
        setLoading(false);
      },
      (err) => {
        console.error('Proofs subscription error:', err);
        setError(err);
        setLoading(false);
      }
    );

    return unsubscribe;
  }, [bountyId]);

  return { proofs, loading, error };
}
