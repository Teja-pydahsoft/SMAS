FROM python:3.11-slim-bookworm

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app

ENV HOST=0.0.0.0
ENV PORT=8000
ENV INDEX_DIR=/data
ENV INSIGHTFACE_MODEL=buffalo_s
ENV DET_SIZE=320,320
ENV CPU_THREADS=2

EXPOSE 8000

CMD ["sh", "-c", "uvicorn app.main:app --host ${HOST} --port ${PORT}"]
