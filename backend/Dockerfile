# QueueSight API: FastAPI + the trained models + the dataset, in one image.
# docker compose builds it from the repo root (see compose.yaml), so it can also copy data/raw/.
FROM python:3.12-slim

# LightGBM needs the OpenMP library, which the slim image leaves out
RUN apt-get update \
 && apt-get install -y --no-install-recommends libgomp1 \
 && rm -rf /var/lib/apt/lists/*

# No .pyc files, logs straight to the terminal, and patient retries on a slow network
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_DEFAULT_TIMEOUT=120 \
    PIP_RETRIES=10

WORKDIR /app/backend

# 1) Dependencies first. Docker caches this step, so changing code doesn't reinstall pandas & co.
COPY backend/requirements.txt .
RUN pip install -r requirements.txt

# 2) Then the code, the trained models and the dataset, in the same folders as the repo
COPY backend/ .
COPY data/raw/ /app/data/raw/

# Run as a normal user, not root
RUN useradd --create-home queuesight
USER queuesight

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]