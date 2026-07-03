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
