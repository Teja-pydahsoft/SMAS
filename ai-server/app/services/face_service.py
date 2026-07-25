from typing import List, Optional

import cv2
import numpy as np

from app.config import (
    CPU_THREADS,
    DET_SIZE,
    EMBEDDING_SIZE,
    FACE_MATCH_THRESHOLD,
    INSIGHTFACE_MODEL,
)


class FaceService:
    def __init__(self):
        self._app = None

    def _get_app(self):
        if self._app is None:
            from insightface.app import FaceAnalysis

            providers = [
                (
                    "CPUExecutionProvider",
                    {
                        "intra_op_num_threads": CPU_THREADS,
                        "inter_op_num_threads": CPU_THREADS,
                    },
                )
            ]
            self._app = FaceAnalysis(name=INSIGHTFACE_MODEL, providers=providers)
            self._app.prepare(ctx_id=-1, det_size=DET_SIZE)
        return self._app

    def _load_image(self, image_bytes: bytes) -> np.ndarray:
        nparr = np.frombuffer(image_bytes, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if img is None:
            raise ValueError("Invalid image data")
        return img

    def _pick_largest_face(self, faces) -> Optional[object]:
        if not faces:
            return None
        return max(faces, key=lambda f: (f.bbox[2] - f.bbox[0]) * (f.bbox[3] - f.bbox[1]))

    def extract_embedding(self, image_bytes: bytes) -> dict:
        img = self._load_image(image_bytes)
        faces = self._get_app().get(img)
        face = self._pick_largest_face(faces)

        if face is None:
            return {"face_detected": False, "embedding": [], "message": "No face detected"}

        embedding = face.normed_embedding
        if embedding is None or len(embedding) != EMBEDDING_SIZE:
            return {"face_detected": False, "embedding": [], "message": "Failed to extract face embedding"}

        x1, y1, x2, y2 = face.bbox.astype(int)
        return {
            "face_detected": True,
            "embedding": embedding.tolist(),
            "embedding_size": EMBEDDING_SIZE,
            "model": INSIGHTFACE_MODEL,
            "face_box": {
                "x": int(x1),
                "y": int(y1),
                "width": int(x2 - x1),
                "height": int(y2 - y1),
            },
        }

    def extract_embeddings_multi(self, image_bytes: bytes, max_faces: int = 20) -> dict:
        """Detect ALL faces in the image and return an embedding + box for each.

        Used by the Activity monitor, which lists every recognised person in a
        single frame (unlike the gate scan, which only embeds the largest face).
        Faces are ordered largest-first and capped at ``max_faces``.
        """
        img = self._load_image(image_bytes)
        faces = self._get_app().get(img)

        if not faces:
            return {"count": 0, "faces": [], "embedding_size": EMBEDDING_SIZE, "model": INSIGHTFACE_MODEL}

        faces_sorted = sorted(
            faces,
            key=lambda f: (f.bbox[2] - f.bbox[0]) * (f.bbox[3] - f.bbox[1]),
            reverse=True,
        )[:max_faces]

        results = []
        for face in faces_sorted:
            embedding = face.normed_embedding
            if embedding is None or len(embedding) != EMBEDDING_SIZE:
                continue
            x1, y1, x2, y2 = face.bbox.astype(int)
            face_box = {
                "x": int(x1),
                "y": int(y1),
                "width": int(x2 - x1),
                "height": int(y2 - y1),
            }
            results.append(
                {
                    "embedding": embedding.tolist(),
                    "face_box": face_box,
                    "det_score": float(getattr(face, "det_score", 0.0) or 0.0),
                    "thumbnail_jpeg_b64": self._face_thumbnail_b64(img, x1, y1, x2, y2),
                }
            )

        return {
            "count": len(results),
            "faces": results,
            "embedding_size": EMBEDDING_SIZE,
            "model": INSIGHTFACE_MODEL,
        }

    def _face_thumbnail_b64(self, img: np.ndarray, x1: int, y1: int, x2: int, y2: int) -> Optional[str]:
        """Crop a padded face region and return a JPEG as base64 (no data-URI prefix)."""
        import base64

        h, w = img.shape[:2]
        bw = max(1, x2 - x1)
        bh = max(1, y2 - y1)
        pad_x = int(bw * 0.25)
        pad_y = int(bh * 0.25)
        cx1 = max(0, x1 - pad_x)
        cy1 = max(0, y1 - pad_y)
        cx2 = min(w, x2 + pad_x)
        cy2 = min(h, y2 + pad_y)
        crop = img[cy1:cy2, cx1:cx2]
        if crop.size == 0:
            return None
        # Downscale large crops for lighter payloads
        max_side = 160
        ch, cw = crop.shape[:2]
        scale = min(1.0, max_side / max(ch, cw))
        if scale < 1.0:
            crop = cv2.resize(crop, (max(1, int(cw * scale)), max(1, int(ch * scale))))
        ok, buf = cv2.imencode(".jpg", crop, [int(cv2.IMWRITE_JPEG_QUALITY), 85])
        if not ok:
            return None
        return base64.b64encode(buf.tobytes()).decode("ascii")

    @staticmethod
    def cosine_similarity(a: List[float], b: List[float]) -> float:
        va = np.array(a, dtype=np.float32)
        vb = np.array(b, dtype=np.float32)
        if len(va) != len(vb) or len(va) == 0:
            return 0.0
        norm_a = np.linalg.norm(va)
        norm_b = np.linalg.norm(vb)
        if norm_a == 0 or norm_b == 0:
            return 0.0
        return float(np.dot(va, vb) / (norm_a * norm_b))

    def compare_embeddings(self, embedding1: List[float], embedding2: List[float]) -> dict:
        similarity = self.cosine_similarity(embedding1, embedding2)
        return {
            "similarity": round(similarity, 4),
            "matched": similarity >= FACE_MATCH_THRESHOLD,
            "threshold": FACE_MATCH_THRESHOLD,
        }


face_service = FaceService()
