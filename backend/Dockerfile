FROM python:3.11-slim

# Security: don't run as root
RUN adduser --disabled-password --gecos "" appuser

WORKDIR /app

# Install deps first (layer cache)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Drop to non-root
USER appuser

EXPOSE 8000

CMD uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --workers 2
