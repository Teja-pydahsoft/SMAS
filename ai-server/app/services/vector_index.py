import json
import threading
from pathlib import Path
from typing import List, Optional

import faiss
import numpy as np

from app.config import EMBEDDING_SIZE, INDEX_DIR, INDEX_STORE_FILE


class VectorIndex:
    """In-memory FAISS index backed by a persistent id→embedding store.
    
    Supports optional namespacing so multiple projects sharing the same
    AI server keep completely separate indexes. Pass a namespace string
    (e.g. project name or DB name) and each gets its own store file.
    """

    def __init__(self, namespace: str = "default"):
        self._lock = threading.Lock()
        self._store: dict[str, list[float]] = {}
        self._id_list: list[str] = []
        self._index = faiss.IndexFlatIP(EMBEDDING_SIZE)
        # Namespace the store file so multiple projects don't overwrite each other
        safe_ns = "".join(c if c.isalnum() or c in "-_" else "_" for c in namespace)
        store_filename = f"face_index_{safe_ns}.json" if safe_ns and safe_ns != "default" else INDEX_STORE_FILE
        self._store_path = Path(INDEX_DIR) / store_filename
        self._load()

    def _load(self) -> None:
        self._store_path.parent.mkdir(parents=True, exist_ok=True)
        if not self._store_path.exists():
            return
        try:
            with open(self._store_path, encoding="utf-8") as f:
                data = json.load(f)
            if isinstance(data, dict):
                self._store = {k: v for k, v in data.items() if isinstance(v, list) and len(v) == EMBEDDING_SIZE}
                self._rebuild_faiss()
        except (json.JSONDecodeError, OSError):
            self._store = {}

    def _save(self) -> None:
        self._store_path.parent.mkdir(parents=True, exist_ok=True)
        with open(self._store_path, "w", encoding="utf-8") as f:
            json.dump(self._store, f)

    def _normalize(self, embedding: list[float]) -> np.ndarray:
        vec = np.array(embedding, dtype=np.float32)
        if vec.shape[0] != EMBEDDING_SIZE:
            raise ValueError(f"Expected {EMBEDDING_SIZE}-d embedding, got {vec.shape[0]}")
        norm = np.linalg.norm(vec)
        if norm > 0:
            vec = vec / norm
        return vec

    def _rebuild_faiss(self) -> None:
        self._id_list = list(self._store.keys())
        self._index = faiss.IndexFlatIP(EMBEDDING_SIZE)
        if not self._id_list:
            return
        vectors = np.stack([self._normalize(self._store[rid]) for rid in self._id_list]).astype(np.float32)
        self._index.add(vectors)

    def sync(self, entries: List[dict]) -> dict:
        with self._lock:
            self._store = {}
            for entry in entries:
                reg_id = str(entry.get("id", "")).strip()
                embedding = entry.get("embedding")
                if reg_id and isinstance(embedding, list) and len(embedding) == EMBEDDING_SIZE:
                    self._store[reg_id] = embedding
            self._rebuild_faiss()
            self._save()
            return {"count": len(self._store)}

    def upsert(self, reg_id: str, embedding: list[float]) -> dict:
        reg_id = str(reg_id).strip()
        if not reg_id:
            raise ValueError("Registration id is required")
        self._normalize(embedding)
        with self._lock:
            self._store[reg_id] = embedding
            self._rebuild_faiss()
            self._save()
            return {"id": reg_id, "count": len(self._store)}

    def remove(self, reg_id: str) -> dict:
        reg_id = str(reg_id).strip()
        with self._lock:
            removed = self._store.pop(reg_id, None) is not None
            if removed:
                self._rebuild_faiss()
                self._save()
            return {"id": reg_id, "removed": removed, "count": len(self._store)}

    def search(
        self,
        query_embedding: list[float],
        top_k: int = 5,
        threshold: Optional[float] = None,
        min_margin: Optional[float] = None,
    ) -> dict:
        from app.config import FACE_MATCH_THRESHOLD, MIN_MATCH_MARGIN, SEARCH_TOP_K

        threshold = FACE_MATCH_THRESHOLD if threshold is None else threshold
        min_margin = MIN_MATCH_MARGIN if min_margin is None else min_margin
        top_k = min(top_k or SEARCH_TOP_K, len(self._store)) if self._store else 0

        if not self._store or top_k == 0:
            return {"matches": [], "count": 0, "ambiguous": False}

        query = self._normalize(query_embedding).reshape(1, -1).astype(np.float32)

        with self._lock:
            scores, indices = self._index.search(query, top_k)

        matches = []
        for score, idx in zip(scores[0], indices[0]):
            if idx < 0 or idx >= len(self._id_list):
                continue
            similarity = float(score)
            if similarity >= threshold:
                matches.append({"id": self._id_list[idx], "similarity": round(similarity, 4)})

        ambiguous = False
        if len(matches) >= 2 and min_margin > 0:
            margin = matches[0]["similarity"] - matches[1]["similarity"]
            if margin < min_margin:
                ambiguous = True

        return {
            "matches": matches,
            "count": len(self._store),
            "ambiguous": ambiguous,
            "best": matches[0] if matches else None,
        }

    def stats(self) -> dict:
        return {"count": len(self._store), "embedding_size": EMBEDDING_SIZE}


# Registry of namespaced indexes — one per project
_indexes: dict[str, VectorIndex] = {}
_indexes_lock = threading.Lock()


def get_index(namespace: str = "default") -> VectorIndex:
    """Get or create a namespaced VectorIndex for the given project namespace."""
    with _indexes_lock:
        if namespace not in _indexes:
            _indexes[namespace] = VectorIndex(namespace=namespace)
        return _indexes[namespace]


# Default index for backwards compatibility (single-project deployments)
vector_index = get_index("default")

    def _load(self) -> None:
        self._store_path.parent.mkdir(parents=True, exist_ok=True)
        if not self._store_path.exists():
            return
        try:
            with open(self._store_path, encoding="utf-8") as f:
                data = json.load(f)
            if isinstance(data, dict):
                self._store = {k: v for k, v in data.items() if isinstance(v, list) and len(v) == EMBEDDING_SIZE}
                self._rebuild_faiss()
        except (json.JSONDecodeError, OSError):
            self._store = {}

    def _save(self) -> None:
        self._store_path.parent.mkdir(parents=True, exist_ok=True)
        with open(self._store_path, "w", encoding="utf-8") as f:
            json.dump(self._store, f)

    def _normalize(self, embedding: list[float]) -> np.ndarray:
        vec = np.array(embedding, dtype=np.float32)
        if vec.shape[0] != EMBEDDING_SIZE:
            raise ValueError(f"Expected {EMBEDDING_SIZE}-d embedding, got {vec.shape[0]}")
        norm = np.linalg.norm(vec)
        if norm > 0:
            vec = vec / norm
        return vec

    def _rebuild_faiss(self) -> None:
        self._id_list = list(self._store.keys())
        self._index = faiss.IndexFlatIP(EMBEDDING_SIZE)
        if not self._id_list:
            return
        vectors = np.stack([self._normalize(self._store[rid]) for rid in self._id_list]).astype(np.float32)
        self._index.add(vectors)

    def sync(self, entries: List[dict]) -> dict:
        with self._lock:
            self._store = {}
            for entry in entries:
                reg_id = str(entry.get("id", "")).strip()
                embedding = entry.get("embedding")
                if reg_id and isinstance(embedding, list) and len(embedding) == EMBEDDING_SIZE:
                    self._store[reg_id] = embedding
            self._rebuild_faiss()
            self._save()
            return {"count": len(self._store)}

    def upsert(self, reg_id: str, embedding: list[float]) -> dict:
        reg_id = str(reg_id).strip()
        if not reg_id:
            raise ValueError("Registration id is required")
        self._normalize(embedding)
        with self._lock:
            self._store[reg_id] = embedding
            self._rebuild_faiss()
            self._save()
            return {"id": reg_id, "count": len(self._store)}

    def remove(self, reg_id: str) -> dict:
        reg_id = str(reg_id).strip()
        with self._lock:
            removed = self._store.pop(reg_id, None) is not None
            if removed:
                self._rebuild_faiss()
                self._save()
            return {"id": reg_id, "removed": removed, "count": len(self._store)}

    def search(
        self,
        query_embedding: list[float],
        top_k: int = 5,
        threshold: Optional[float] = None,
        min_margin: Optional[float] = None,
    ) -> dict:
        from app.config import FACE_MATCH_THRESHOLD, MIN_MATCH_MARGIN, SEARCH_TOP_K

        threshold = FACE_MATCH_THRESHOLD if threshold is None else threshold
        min_margin = MIN_MATCH_MARGIN if min_margin is None else min_margin
        top_k = min(top_k or SEARCH_TOP_K, len(self._store)) if self._store else 0

        if not self._store or top_k == 0:
            return {"matches": [], "count": 0, "ambiguous": False}

        query = self._normalize(query_embedding).reshape(1, -1).astype(np.float32)

        with self._lock:
            scores, indices = self._index.search(query, top_k)

        matches = []
        for score, idx in zip(scores[0], indices[0]):
            if idx < 0 or idx >= len(self._id_list):
                continue
            similarity = float(score)
            if similarity >= threshold:
                matches.append({"id": self._id_list[idx], "similarity": round(similarity, 4)})

        ambiguous = False
        if len(matches) >= 2 and min_margin > 0:
            margin = matches[0]["similarity"] - matches[1]["similarity"]
            if margin < min_margin:
                ambiguous = True

        return {
            "matches": matches,
            "count": len(self._store),
            "ambiguous": ambiguous,
            "best": matches[0] if matches else None,
        }

    def stats(self) -> dict:
        return {"count": len(self._store), "embedding_size": EMBEDDING_SIZE}


vector_index = VectorIndex()
