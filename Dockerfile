FROM python:3.11-slim

WORKDIR /app

# Install dependencies first (cached layer)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy source
COPY . .

# Build dashboard
RUN apt-get update && apt-get install -y nodejs npm && \
    cd dashboard-src && npm ci && npm run build && \
    apt-get purge -y nodejs npm && apt-get autoremove -y && \
    rm -rf /var/lib/apt/lists/* dashboard-src/node_modules

EXPOSE 3000

CMD ["python", "run.py"]
