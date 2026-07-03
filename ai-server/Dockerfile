FROM python:3.11-bookworm

ENV DEBIAN_FRONTEND=noninteractive
ENV PIP_DEFAULT_TIMEOUT=300
ENV PIP_NO_CACHE_DIR=1

WORKDIR /app

# Build tools + OpenCV/ONNX runtime system libs (slim images fail on insightface/faiss)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    g++ \
    cmake \
    git \
    swig \
    libgl1 \
    libglib2.0-0 \
    libgomp1 \
    libsm6 \
    libxext6 \
    libxrender1 \
    libopenblas-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .

# Install heavy ML wheels first, then the rest (avoids resolver/build failures on HF)
RUN pip install --upgrade pip setuptools wheel cython \
    && pip install numpy==1.26.4 \
    && pip install onnxruntime==1.19.2 \
    && pip install opencv-python-headless==4.10.0.84 \
    && pip install faiss-cpu==1.8.0.post1 \
    && pip install insightface==0.7.3 \
    && pip install fastapi==0.115.6 "uvicorn[standard]==0.34.0" python-multipart==0.0.20 Pillow==11.1.0

COPY app ./app

ENV HOST=0.0.0.0
ENV PORT=8000
ENV INDEX_DIR=/tmp/data
ENV INSIGHTFACE_MODEL=buffalo_s
ENV DET_SIZE=320,320
ENV CPU_THREADS=2

EXPOSE 8000

CMD ["sh", "-c", "uvicorn app.main:app --host ${HOST} --port ${PORT}"]
