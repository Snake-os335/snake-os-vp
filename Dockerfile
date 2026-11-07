FROM python:3.11-slim

# 2026.23: Doganiero VR (vr_link.py + vr-search/vr-send). Este comentario solo fuerza
# la reconstrucción/reinicio del contenedor para que el Python nuevo entre en producción.
WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssh-client \
  && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN mkdir -p /app/data

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
