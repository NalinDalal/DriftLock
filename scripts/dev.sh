#!/bin/bash
set -e

echo "🔧 Starting DriftLock development environment..."

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker and try again."
    exit 1
fi

# Start services
echo "🚀 Starting services..."
docker compose up -d db

echo "⏳ Waiting for database..."
sleep 5

echo "🔄 Running migrations..."
docker compose run --rm be bun run db:migrate

echo "🚀 Starting all services..."
docker compose up -d

echo "✅ Development environment ready!"
echo ""
echo "Services:"
echo "  Backend API: http://localhost:3000"
echo "  Webhook Server: http://localhost:3001"
echo "  Frontend: http://localhost:5173"
echo "  Database: localhost:5432"
echo ""
echo "Commands:"
echo "  docker compose logs -f        # View logs"
echo "  docker compose down           # Stop services"
echo "  docker compose exec be bash   # Shell into backend"
