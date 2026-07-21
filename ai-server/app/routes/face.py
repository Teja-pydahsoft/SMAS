from typing import Optional

from fastapi import APIRouter, File, HTTPException, Header, UploadFile
from pydantic import BaseModel, Field

from app.config import EMBEDDING_SIZE, FACE_MATCH_THRESHOLD, MIN_MATCH_MARGIN, SEARCH_TOP_K
from app.services.face_service import face_service
from app.services.vector_index import get_index

router = APIRouter()


def _get_index(x_index_namespace: Optional[str] = None):
    """Resolve the correct VectorIndex for the requesting project."""
    ns = (x_index_namespace or "default").strip() or "default"
    return get_index(ns)


class CompareRequest(BaseModel):
    embedding1: list[float] = Field(..., min_length=1)
    embedding2: list[float] = Field(..., min_length=1)


class IndexEntry(BaseModel):
    id: str
    embedding: list[float]


class IndexSyncRequest(BaseModel):
    entries: list[IndexEntry] = Field(default_factory=list)


class IndexUpsertRequest(BaseModel):
    id: str
    embedding: list[float] = Field(..., min_length=EMBEDDING_SIZE, max_length=EMBEDDING_SIZE)


class IndexRemoveRequest(BaseModel):
    id: str


class SearchRequest(BaseModel):
    embedding: list[float] = Field(..., min_length=EMBEDDING_SIZE, max_length=EMBEDDING_SIZE)
    top_k: int = Field(default=SEARCH_TOP_K, ge=1, le=50)
    threshold: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    min_margin: Optional[float] = Field(default=None, ge=0.0, le=1.0)


@router.get("/index/stats")
async def index_stats(x_index_namespace: Optional[str] = Header(default=None)):
    return _get_index(x_index_namespace).stats()


@router.post("/index/sync")
async def sync_index(body: IndexSyncRequest, x_index_namespace: Optional[str] = Header(default=None)):
    result = _get_index(x_index_namespace).sync([e.model_dump() for e in body.entries])
    return {"ok": True, **result}


@router.post("/index/upsert")
async def upsert_index(body: IndexUpsertRequest, x_index_namespace: Optional[str] = Header(default=None)):
    try:
        result = _get_index(x_index_namespace).upsert(body.id, body.embedding)
        return {"ok": True, **result}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/index/remove")
async def remove_from_index(body: IndexRemoveRequest, x_index_namespace: Optional[str] = Header(default=None)):
    result = _get_index(x_index_namespace).remove(body.id)
    return {"ok": True, **result}


@router.post("/search")
async def search_faces(body: SearchRequest, x_index_namespace: Optional[str] = Header(default=None)):
    try:
        result = _get_index(x_index_namespace).search(
            body.embedding,
            top_k=body.top_k,
            threshold=body.threshold,
            min_margin=body.min_margin,
        )
        return {
            **result,
            "threshold": body.threshold if body.threshold is not None else FACE_MATCH_THRESHOLD,
            "min_margin": body.min_margin if body.min_margin is not None else MIN_MATCH_MARGIN,
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/embed")
async def extract_embedding(file: UploadFile = File(...)):
    content_type = (file.content_type or "").lower()
    if content_type and not content_type.startswith("image/") and content_type != "application/octet-stream":
        raise HTTPException(status_code=400, detail="File must be an image")

    image_bytes = await file.read()
    if len(image_bytes) == 0:
        raise HTTPException(status_code=400, detail="Empty file")

    try:
        result = face_service.extract_embedding(image_bytes)
        if not result["face_detected"]:
            raise HTTPException(status_code=400, detail=result.get("message", "No face detected"))
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/compare")
async def compare_embeddings(body: CompareRequest):
    if len(body.embedding1) != len(body.embedding2):
        raise HTTPException(status_code=400, detail="Embeddings must have the same dimension")

    result = face_service.compare_embeddings(body.embedding1, body.embedding2)
    return result
