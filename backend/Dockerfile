# ---------------------------------------------------------------------------
# Pressure — backend API (FastAPI + Motor/MongoDB)
# Self-contained image. Requires a reachable MongoDB (see docker-compose.yml).
# ---------------------------------------------------------------------------
FROM python:3.11-slim

# Faster, cleaner Python in containers
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

WORKDIR /app

# Install runtime deps first (better layer caching)
COPY requirements-runtime.txt .
RUN pip install --no-cache-dir -r requirements-runtime.txt

# Copy the application source (server + game engine + config modules)
COPY *.py ./

EXPOSE 8000

# NOTE: match state is in-memory -> run a SINGLE worker (do not scale to >1).
CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1", "--proxy-headers", "--forwarded-allow-ips=*"]