/**
 * One-shot Firestore migration: bounties → contributions
 *
 * Copies every doc from the legacy `bounties` collection into the new
 * `contributions` collection (preserving document IDs), then prompts before
 * deleting the old collection. Idempotent up to the delete step.
 *
 * Usage:
 *   pnpm tsx contribute-system/scripts/migrate-firestore.ts [--dry-run] [--delete-source]
 *
 * Flags:
 *   --dry-run        Print what would happen without writing to Firestore
 *   --delete-source  After successful copy, delete docs from old `bounties` collection
 *                    (omit to leave both collections present for verification window)
 *
 * Requires:
 *   - GOOGLE_APPLICATION_CREDENTIALS pointed at a service account with
 *     datastore.user role on the intentional-bounty project
 *   - @google-cloud/firestore (already in @contribute/cli deps)
 *
 * Sequencing (per Phase 7 of bounty → contribute rebrand):
 *   1. Deploy app code that reads/writes to `contributions` collection
 *   2. Run this script with --dry-run first
 *   3. Run without flags to copy
 *   4. Verify dashboard works against `contributions`
 *   5. After ≥1 week soak, run with --delete-source
 */

import { Firestore } from '@google-cloud/firestore';

const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT || 'intentional-bounty';
const SOURCE_COLLECTION = 'bounties';
const TARGET_COLLECTION = 'contributions';

const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run');
const deleteSource = args.has('--delete-source');

async function main() {
  const db = new Firestore({ projectId: PROJECT_ID });
  console.log(`Connected to Firestore project ${PROJECT_ID}`);
  console.log(`Source: ${SOURCE_COLLECTION} → Target: ${TARGET_COLLECTION}`);
  console.log(`Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}, deleteSource=${deleteSource}\n`);

  const sourceSnap = await db.collection(SOURCE_COLLECTION).get();
  console.log(`Found ${sourceSnap.size} docs in ${SOURCE_COLLECTION}`);

  if (sourceSnap.empty) {
    console.log('Nothing to migrate. Exiting.');
    return;
  }

  let copied = 0;
  let skipped = 0;
  const batches: FirebaseFirestore.WriteBatch[] = [];
  let currentBatch = db.batch();
  let opsInBatch = 0;
  const BATCH_LIMIT = 400; // Firestore batch limit is 500 ops; leave headroom

  for (const doc of sourceSnap.docs) {
    const targetRef = db.collection(TARGET_COLLECTION).doc(doc.id);
    const existing = await targetRef.get();
    if (existing.exists) {
      skipped++;
      continue;
    }
    if (!dryRun) {
      // Field rename: bountyId → contributionId, if any embedded refs
      const data = doc.data();
      if ('bountyId' in data) {
        data.contributionId = data.bountyId;
        delete data.bountyId;
      }
      currentBatch.set(targetRef, data);
      opsInBatch++;
      if (opsInBatch >= BATCH_LIMIT) {
        batches.push(currentBatch);
        currentBatch = db.batch();
        opsInBatch = 0;
      }
    }
    copied++;
  }

  if (opsInBatch > 0) batches.push(currentBatch);

  if (!dryRun && batches.length > 0) {
    console.log(`Committing ${batches.length} batch(es)...`);
    for (const [i, b] of batches.entries()) {
      await b.commit();
      console.log(`  Batch ${i + 1}/${batches.length} committed`);
    }
  }

  console.log(`\n✓ Copied: ${copied}, Skipped (already existed): ${skipped}`);

  if (deleteSource) {
    if (dryRun) {
      console.log('\n(dry-run) Would delete source collection now.');
      return;
    }
    console.log(`\nDeleting docs from ${SOURCE_COLLECTION}...`);
    let deleteBatch = db.batch();
    let opsInDelete = 0;
    for (const doc of sourceSnap.docs) {
      deleteBatch.delete(doc.ref);
      opsInDelete++;
      if (opsInDelete >= BATCH_LIMIT) {
        await deleteBatch.commit();
        deleteBatch = db.batch();
        opsInDelete = 0;
      }
    }
    if (opsInDelete > 0) await deleteBatch.commit();
    console.log(`✓ Deleted ${sourceSnap.size} docs from ${SOURCE_COLLECTION}`);
  } else {
    console.log(`\nLeaving ${SOURCE_COLLECTION} intact. Re-run with --delete-source after verification window.`);
  }
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
