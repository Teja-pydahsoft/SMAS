from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import CPU_THREADS, EMBEDDING_SIZE, FACE_MATCH_THRESHOLD, INSIGHTFACE_MODEL
from app.services.vector_index import vector_index

app = FastAPI(
    title="SMAS AI Server",
    description="InsightFace embeddings + FAISS vector search for SMAS",
    version="2.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
async def root():
    return {
        "service": "smas-ai-server",
        "status": "ok",
        "health": "/health",
        "docs": "/docs",
    }


@app.get("/health")
async def health():
    stats = vector_index.stats()
    return {
        "status": "ok",
        "service": "smas-ai-server",
        "model": INSIGHTFACE_MODEL,
        "device": "cpu",
        "cpu_threads": CPU_THREADS,
        "embedding_size": EMBEDDING_SIZE,
        "match_threshold": FACE_MATCH_THRESHOLD,
        "indexed_faces": stats["count"],
    }


from app.routes.face import router as face_router

app.include_router(face_router)
