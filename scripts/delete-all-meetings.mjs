#!/usr/bin/env node
/**
 * Delete every document under organizations/{orgId}/meetings (Firestore).
 *
 * Requires Firebase Admin credentials, e.g.:
 *   export GOOGLE_APPLICATION_CREDENTIALS=/path/to/serviceAccount.json
 * or:
 *   gcloud auth application-default login
 *
 * Usage:
 *   node scripts/delete-all-meetings.mjs [--project=notus-e026b] [--org=ORG_ID] [--dry-run]
 *
 * Default project id is read from GOOGLE_CLOUD_PROJECT / GCLOUD_PROJECT or notus-e026b.
 */

import { initializeApp, applicationDefault, getApps } from 'firebase-admin/app'
import { getFirestore, FieldPath } from 'firebase-admin/firestore'

function arg(name) {
  const p = process.argv.find((a) => a === name || a.startsWith(`${name}=`))
  if (!p) return null
  if (p.includes('=')) return p.split('=').slice(1).join('=')
  const i = process.argv.indexOf(p)
  return process.argv[i + 1] || null
}

const dryRun = process.argv.includes('--dry-run')
const orgFilter = arg('--org')
const projectFromFlag = arg('--project')
const projectId =
  projectFromFlag ||
  process.env.GOOGLE_CLOUD_PROJECT ||
  process.env.GCLOUD_PROJECT ||
  process.env.FIREBASE_PROJECT_ID ||
  'notus-e026b'

if (getApps().length === 0) {
  initializeApp({
    credential: applicationDefault(),
    projectId,
  })
}

const db = getFirestore()

async function processMeetingsCollection(colRef, label) {
  let total = 0
  let lastDoc = null
  while (true) {
    let q = colRef.orderBy(FieldPath.documentId()).limit(500)
    if (lastDoc) q = q.startAfter(lastDoc)
    const snap = await q.get()
    if (snap.empty) break
    total += snap.size
    lastDoc = snap.docs[snap.docs.length - 1]
    if (dryRun) {
      console.log(`[dry-run] ${label}: +${snap.size} (subtotal ${total})`)
      continue
    }
    const batch = db.batch()
    snap.docs.forEach((d) => batch.delete(d.ref))
    await batch.commit()
    console.log(`Deleted ${snap.size} from ${label} (total ${total})`)
  }
  return total
}

async function main() {
  console.log(`Project: ${projectId}${dryRun ? ' (dry-run)' : ''}${orgFilter ? ` org=${orgFilter}` : ''}`)

  const orgsSnap = await db.collection('organizations').get()
  const orgIds = orgFilter
    ? orgsSnap.docs.map((d) => d.id).filter((id) => id === orgFilter)
    : orgsSnap.docs.map((d) => d.id)

  if (orgFilter && orgIds.length === 0) {
    console.error(`No organization found with id: ${orgFilter}`)
    process.exit(1)
  }

  let grand = 0
  for (const orgId of orgIds) {
    const meetingsRef = db.collection('organizations').doc(orgId).collection('meetings')
    const n = await processMeetingsCollection(meetingsRef, `organizations/${orgId}/meetings`)
    grand += n
  }

  console.log(dryRun ? `[dry-run] Total meeting documents: ${grand}` : `Done. Removed ${grand} meeting document(s).`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
