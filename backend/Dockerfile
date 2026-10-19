# IREC backend: one image for the API (default command) and the worker (python -m app.worker).
# Pin both base images by digest in CI (FROM python:3.13.6-slim@sha256:...) for reproducible builds.
FROM python:3.13.6-slim AS build
COPY --from=ghcr.io/astral-sh/uv:0.12.17 /uv /bin/uv
WORKDIR /app
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy UV_PYTHON_DOWNLOADS=never
# COPY . .
# Use a committed Python 3.13 lockfile when present; otherwise generate a compatible one.
COPY pyproject.toml uv.lock ./
RUN if [ -f uv.lock ]; then \
      uv sync --frozen --no-dev --no-install-project; \
    else \
      uv lock --python 3.13.6 && uv sync --frozen --no-dev --no-install-project; \
    fi
COPY alembic.ini ./
COPY migrations ./migrations
COPY app ./app
FROM python:3.13.6-slim
WORKDIR /app
ENV PATH=/app/.venv/bin:$PATH PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
COPY --from=build /app /app
# The runtime never installs packages: drop pip, and with it the CVEs in the libraries pip vendors.
RUN /usr/local/bin/python -m pip uninstall -y pip && rm -rf /usr/local/lib/python3.13/ensurepip
# Numeric, unprivileged, owns nothing in the image: the code is read-only to the process.
USER 10001:10001
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD ["python", "-c", "import sys, urllib.request; sys.exit(urllib.request.urlopen('http://127.0.0.1:8000/api/healthz', timeout=4).status != 200)"]
# X-Forwarded-For is trusted only from FORWARDED_ALLOW_IPS (default: localhost). deploy/compose.yml
# sets it to Caddy's network, and Caddy overwrites the header with the real client address.
CMD ["uvicorn", "app.main:create_app", "--factory", "--host", "0.0.0.0", "--port", "8000", "--no-server-header", \
     "--proxy-headers"]
