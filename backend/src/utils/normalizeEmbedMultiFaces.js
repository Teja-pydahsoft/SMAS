/**
 * Normalize /embed-multi faces on the API route side (do not change AI server).
 * Filters low-confidence detections, tiny boxes, and overlapping duplicates.
 */

const DET_SCORE_MIN = parseFloat(process.env.FACE_DET_SCORE_MIN || '0.45');
const MIN_RELATIVE_AREA = parseFloat(process.env.FACE_MIN_RELATIVE_AREA || '0.18');
const IOU_DEDUP = parseFloat(process.env.FACE_IOU_DEDUP || '0.35');

function boxArea(box) {
  if (!box) return 0;
  const w = Math.max(0, Number(box.width) || 0);
  const h = Math.max(0, Number(box.height) || 0);
  return w * h;
}

function boxIou(a, b) {
  if (!a || !b) return 0;
  const ax1 = Number(a.x) || 0;
  const ay1 = Number(a.y) || 0;
  const ax2 = ax1 + Math.max(0, Number(a.width) || 0);
  const ay2 = ay1 + Math.max(0, Number(a.height) || 0);
  const bx1 = Number(b.x) || 0;
  const by1 = Number(b.y) || 0;
  const bx2 = bx1 + Math.max(0, Number(b.width) || 0);
  const by2 = by1 + Math.max(0, Number(b.height) || 0);

  const ix1 = Math.max(ax1, bx1);
  const iy1 = Math.max(ay1, by1);
  const ix2 = Math.min(ax2, bx2);
  const iy2 = Math.min(ay2, by2);
  const iw = Math.max(0, ix2 - ix1);
  const ih = Math.max(0, iy2 - iy1);
  const inter = iw * ih;
  if (inter <= 0) return 0;
  const union = boxArea(a) + boxArea(b) - inter;
  return union > 0 ? inter / union : 0;
}

/**
 * @param {object|null} facesResult - raw /embed-multi payload
 * @returns {object[]} cleaned face objects with embedding + face_box
 */
export function normalizeEmbedMultiFaces(facesResult) {
  const raw = Array.isArray(facesResult?.faces) ? facesResult.faces : [];
  if (!raw.length) return [];

  const withScore = raw
    .filter((f) => Array.isArray(f?.embedding) && f.embedding.length > 0 && f?.face_box)
    .map((f) => ({
      ...f,
      det_score: Number(f.det_score) || 0,
      _area: boxArea(f.face_box),
    }))
    .filter((f) => f.det_score >= DET_SCORE_MIN && f._area > 0);

  if (!withScore.length) return [];

  // Largest face first (same order AI server uses)
  withScore.sort((a, b) => b._area - a._area || b.det_score - a.det_score);
  const maxArea = withScore[0]._area;

  // Drop tiny detections relative to the primary face (common false positives / far reflections)
  const sized = withScore.filter((f) => f._area >= maxArea * MIN_RELATIVE_AREA);

  // Non-max suppression: drop heavily overlapping boxes, keep higher score / larger
  const kept = [];
  for (const face of sized) {
    const overlaps = kept.some((k) => boxIou(k.face_box, face.face_box) >= IOU_DEDUP);
    if (!overlaps) kept.push(face);
  }

  return kept.map(({ _area, ...face }) => face);
}
