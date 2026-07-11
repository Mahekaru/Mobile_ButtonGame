# Self-Hosting the Pressure Backend

The backend is a small, **self-contained** FastAPI service backed by MongoDB. It
uses **no third-party cloud APIs** — the only external dependency is a MongoDB
database. You can run it locally, in Docker, or on any host/VM/PaaS that can run
a Python ASGI app.

---

## 1. Technology stack

| Layer          | Technology                     | Purpose                                   |
|----------------|--------------------------------|-------------------------------------------|
| Language       | Python 3.11 (3.10+ works)      | —                                         |
| Web framework  | FastAPI (ASGI)                 | REST + WebSocket routes (all under `/api`)|
| ASGI server    | Uvicorn (`uvicorn[standard]`)  | Serves HTTP + WebSockets                  |
| Database       | MongoDB 5+                     | Accounts & progression (local/Atlas/self) |
| DB driver      | Motor (async) + PyMongo        | Async access to MongoDB                   |
| Auth           | PyJWT + bcrypt                 | JWT tokens + password hashing             |
| Validation     | Pydantic v2 + email-validator  | Request/response models                   |
| Realtime       | `websockets`                   | Live match transport (`/api/match/{id}/ws`)|
| Config         | python-dotenv                  | Loads `.env`                              |

### Source layout (`backend/`)
- `server.py` — FastAPI routes, JWT auth, CORS, Mongo access
- `game.py` — in-memory server-authoritative `MatchManager` (async match loop + bots)
- `config.py` — tunables, catalogs, progression/XP math
- `challenges.py` — daily-challenge logic
- `seasons.py` — weekly (ISO-week) leaderboard reset logic

> **Important — single process:** live match state lives **in memory**, not in
> MongoDB. Run with **one worker** (`--workers 1`) and do **not** horizontally
> scale the API behind a load balancer, or players would land on different
> in-memory match managers. Only accounts/progression are persisted to Mongo.

---

## 2. Environment variables (`backend/.env`)

```
MONGO_URL=mongodb://localhost:27017     # MongoDB connection string (or Atlas SRV URI)
DB_NAME=pressure                        # any database name
JWT_SECRET=<a long random string>       # signs/verifies auth tokens — keep secret
CORS_ORIGINS=*                          # or a comma-separated list of allowed origins
```

Generate a good secret:
```bash
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

---

## 3. Run locally (no Docker)

```bash
cd backend

# 1) Have MongoDB running locally, or point MONGO_URL at Atlas.
# 2) Create a virtualenv and install the LEAN runtime deps:
python -m venv .venv && source .venv/bin/activate
pip install -r requirements-runtime.txt

# 3) Create backend/.env (see section 2), then start the API:
uvicorn server:app --host 0.0.0.0 --port 8001 --workers 1
```

Health check:
```bash
curl http://localhost:8001/api/          # -> {"message": "...", "status": "online"}
```

---

## 4. Run with Docker (API + MongoDB together)

A `Dockerfile` and `docker-compose.yml` are included in `backend/`.

```bash
cd backend
docker compose up --build
```

This starts MongoDB (with a persistent `mongo_data` volume) and the API on
`http://localhost:8001`. Edit `JWT_SECRET`/`DB_NAME`/`CORS_ORIGINS` in
`docker-compose.yml` (or swap to an `.env` file) before any real deployment.

To use an external MongoDB (e.g. Atlas) instead of the bundled one, delete the
`mongo` service and set `MONGO_URL` on the `api` service to your Atlas URI.

---

## 5. Connecting the frontend (Expo app)

Point the app at your backend by setting, in `frontend/.env`:

```
EXPO_PUBLIC_BACKEND_URL=http://<your-host>:8001
```

The client automatically appends `/api` to reach the routes, and derives the
WebSocket URL (`ws(s)://<host>/api/match/{id}/ws?token=...`) from the same base,
with an automatic HTTP-polling fallback if the socket can't connect.

---

## 6. Dependency note

`requirements.txt` is the platform's default template and includes packages this
app does **not** use at runtime (e.g. `boto3`, `pandas`, `numpy`, `python-jose`,
`passlib`, `jq`, `typer`, `emergentintegrations`) plus dev tools
(`pytest`, `black`, `flake8`, `mypy`, `isort`). For a lean self-hosted build use
**`requirements-runtime.txt`** (used by the Dockerfile). To run the test suite,
also `pip install pytest requests pymongo python-dotenv websocket-client`.

---

## 7. Production checklist

- [ ] Strong, unique `JWT_SECRET` (never commit it).
- [ ] Restrict `CORS_ORIGINS` to your real frontend domain(s) instead of `*`.
- [ ] Managed/replicated MongoDB with backups (Atlas or self-managed).
- [ ] Terminate TLS at a reverse proxy (nginx/Caddy/Traefik) in front of Uvicorn;
      required for `wss://` WebSockets from mobile clients.
- [ ] Keep it a **single API instance** (in-memory matches). Scale vertically.
- [ ] Optional: put a process manager (systemd/supervisor) or the container
      runtime's `restart: unless-stopped` in front of Uvicorn.
