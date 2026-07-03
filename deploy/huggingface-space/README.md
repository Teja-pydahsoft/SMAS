---
title: SMAS AI Server
emoji: 🤖
colorFrom: blue
colorTo: green
sdk: docker
app_port: 8000
pinned: false
---

# SMAS AI Server

Face embedding and search API for the Smart Management Access System.

- `GET /health` — service status
- `POST /embed` — extract face embedding from image
- `POST /compare` — compare two embeddings
- `POST /search` — search face index
