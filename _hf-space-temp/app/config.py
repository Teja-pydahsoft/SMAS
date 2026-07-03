import os

HOST = os.getenv("HOST", "0.0.0.0")
PORT = int(os.getenv("PORT", "8000"))

# ArcFace cosine similarity threshold (InsightFace buffalo_l: ~0.40–0.50 typical)
FACE_MATCH_THRESHOLD = float(os.getenv("FACE_MATCH_THRESHOLD", "0.42"))
MIN_MATCH_MARGIN = float(os.getenv("MIN_MATCH_MARGIN", "0.05"))
SEARCH_TOP_K = int(os.getenv("SEARCH_TOP_K", "5"))

# buffalo_l: best accuracy, ~1 GB RAM — fine on 16 GB CPU-only hosts
# buffalo_s: ~2x faster on CPU, slightly lower accuracy, ~500 MB RAM
INSIGHTFACE_MODEL = os.getenv("INSIGHTFACE_MODEL", "buffalo_l")
DET_SIZE = tuple(int(x) for x in os.getenv("DET_SIZE", "640,640").split(","))
CPU_THREADS = int(os.getenv("CPU_THREADS", "4"))

EMBEDDING_SIZE = 512

INDEX_DIR = os.getenv("INDEX_DIR", os.path.join(os.path.dirname(__file__), "..", "data"))
INDEX_STORE_FILE = "face_index_store.json"
