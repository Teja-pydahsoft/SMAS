import Registration from '../models/Registration.js';
import { REGISTRATION_STATUS } from '../constants/index.js';
import { syncFaceIndex, upsertFaceIndexEntry, removeFaceIndexEntry } from './aiClient.js';

const EMBEDDING_SIZE = parseInt(process.env.FACE_EMBEDDING_SIZE || '512', 10);

function isValidEmbedding(embedding) {
  return Array.isArray(embedding) && embedding.length === EMBEDDING_SIZE;
}

export async function rebuildFaceIndexFromDb() {
  const verified = await Registration.find({
    status: REGISTRATION_STATUS.VERIFIED,
    faceEmbedding: { $exists: true, $ne: [] },
  }).select('_id faceEmbedding');

  const entries = verified
    .filter((r) => isValidEmbedding(r.faceEmbedding))
    .map((r) => ({
      id: r._id.toString(),
      embedding: r.faceEmbedding,
    }));

  const skipped = verified.length - entries.length;
  const result = await syncFaceIndex(entries);

  return {
    indexed: result.count ?? entries.length,
    skipped,
    totalVerified: verified.length,
  };
}

export async function indexVerifiedRegistration(registration) {
  if (
    registration.status !== REGISTRATION_STATUS.VERIFIED ||
    !isValidEmbedding(registration.faceEmbedding)
  ) {
    return null;
  }

  return upsertFaceIndexEntry(registration._id.toString(), registration.faceEmbedding);
}

export async function removeRegistrationFromFaceIndex(registrationId) {
  return removeFaceIndexEntry(registrationId.toString());
}
