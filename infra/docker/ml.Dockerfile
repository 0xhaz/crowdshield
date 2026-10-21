# ML gateway (FastAPI): redaction, Nebius Token Factory, Tavily.
FROM python:3.12-slim
COPY --from=ghcr.io/astral-sh/uv:0.8.22 /uv /usr/local/bin/uv
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy PATH=/app/.venv/bin:$PATH
WORKDIR /app
COPY apps/ml/pyproject.toml apps/ml/uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project
COPY apps/ml/src ./src
RUN uv sync --frozen --no-dev && useradd -r ml
USER ml
EXPOSE 8020
CMD ["uvicorn", "crowdshield_ml.app:app", "--host", "0.0.0.0", "--port", "8020", "--app-dir", "src"]
