FROM node:22-alpine AS ui
WORKDIR /src/web
COPY web/package*.json ./
RUN npm ci
COPY web ./
RUN npm run build

FROM python:3.12-slim AS runtime
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 AKSHAUHINI_DB=/data/akshauhini.sqlite
WORKDIR /app
COPY pyproject.toml README.md ./
COPY akshauhini ./akshauhini
COPY docs/CONNECTING_APPS.md ./akshauhini/connection-guide.md
COPY --from=ui /src/web/dist ./akshauhini/static
RUN pip install --no-cache-dir . \
    && groupadd --gid 10001 appuser \
    && useradd --uid 10001 --gid 10001 --no-create-home appuser \
    && mkdir -p /data && chown appuser:appuser /data
USER appuser
EXPOSE 8765
CMD ["uvicorn", "akshauhini.server:create_app", "--factory", "--host", "0.0.0.0", "--port", "8765"]
