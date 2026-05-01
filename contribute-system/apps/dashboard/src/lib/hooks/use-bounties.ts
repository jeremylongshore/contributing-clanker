'use client';

/**
 * Bounties Hook
 *
 * Real-time Firestore listener for bounties collection.
 */

import { useState, useEffect } from 'react';
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  where,
  QueryConstraint
} from 'firebase/firestore';
import { getFirebaseDb } from '../firebase';

export interface Bounty {
  id: string;
  title: string;
  description?: string;
  value: number;
  status: 'open' | 'claimed' | 'in_progress' | 'submitted' | 'vetting' | 'completed' | 'revision' | 'cancelled';
  source: string;
  repo?: string;
  issue?: number;
  pr?: number;
  domainId?: string;
  categories?: string[];
  claimedBy?: string;
  createdAt: string;
  updatedAt?: string;
  timeline?: Array<{
    timestamp: string;
    message: string;
    type: string;
  }>;
}

interface UseBountiesOptions {
  status?: Bounty['status'] | Bounty['status'][];
  source?: string;
  limit?: number;
}

export function useBounties(options: UseBountiesOptions = {}) {
  const [bounties, setBounties] = useState<Bounty[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const db = getFirebaseDb();
    const constraints: QueryConstraint[] = [orderBy('createdAt', 'desc')];

    if (options.status) {
      if (Array.isArray(options.status)) {
        constraints.push(where('status', 'in', options.status));
      } else {
        constraints.push(where('status', '==', options.status));
      }
    }

    if (options.source) {
      constraints.push(where('source', '==', options.source));
    }

    const q = query(collection(db, 'bounties'), ...constraints);

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const data = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as Bounty[];

        setBounties(options.limit ? data.slice(0, options.limit) : data);
        setLoading(false);
      },
      (err) => {
        console.error('Bounties subscription error:', err);
        setError(err);
        setLoading(false);
      }
    );

    return unsubscribe;
  }, [options.status, options.source, options.limit]);

  return { bounties, loading, error };
}

export function useBounty(id: string) {
  const [bounty, setBounty] = useState<Bounty | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!id) {
      setLoading(false);
      return;
    }

    const db = getFirebaseDb();
    const unsubscribe = onSnapshot(
      collection(db, 'bounties'),
      (snapshot) => {
        const doc = snapshot.docs.find(d => d.id === id);
        if (doc) {
          setBounty({ id: doc.id, ...doc.data() } as Bounty);
        } else {
          setBounty(null);
        }
        setLoading(false);
      },
      (err) => {
        console.error('Bounty subscription error:', err);
        setError(err);
        setLoading(false);
      }
    );

    return unsubscribe;
  }, [id]);

  return { bounty, loading, error };
}
