#!/bin/bash
set -e

echo "🧪 Running DriftLock tests..."

# Check if database is available
if [ -z "$DATABASE_URL" ]; then
    export DATABASE_URL="postgresql://driftlock:driftlock@localhost:5432/driftlock_test"
fi

# Start test database if needed
if ! pg_isready -h localhost -p 5432 > /dev/null 2>&1; then
    echo "🗄️ Starting test database..."
    docker compose up -d db
    sleep 5
fi

# Create test database if it doesn't exist
psql "$DATABASE_URL" -c "CREATE DATABASE driftlock_test;" 2>/dev/null || true

# Run tests
echo "🧪 Running tests..."
bun test packages/db/
bun test packages/diff/
bun test packages/pipeline/
bun test packages/webhook-capture/
bun test packages/ai-fix/
bun test packages/migrations/
bun test packages/rules-engine/

echo "✅ All tests passed!"
