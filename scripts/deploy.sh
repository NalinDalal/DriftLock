#!/bin/bash
set -e

echo "🚀 Deploying DriftLock..."

# Check required environment variables
required_vars=("DATABASE_URL" "GITHUB_TOKEN")
for var in "${required_vars[@]}"; do
    if [ -z "${!var}" ]; then
        echo "❌ Error: $var is not set"
        exit 1
    fi
done

# Build and start services
echo "📦 Building Docker images..."
docker compose build

echo "🗄️ Starting database..."
docker compose up -d db
sleep 5

echo "🔄 Running migrations..."
docker compose run --rm be bun run db:migrate

echo "🚀 Starting services..."
docker compose up -d

echo "✅ Deployment complete!"
echo ""
echo "Services:"
echo "  Backend API: http://localhost:3000"
echo "  Webhook Server: http://localhost:3001"
echo "  Frontend: http://localhost:5173"
