#!/usr/bin/env bash
set -euo pipefail

# Change to the repo root
cd "$(dirname "$0")/.."

# Generate TypeScript protobuf files (Frontend)
echo "Generating TypeScript protobuf files..."

if command -v npm &> /dev/null; then
    cd weights_studio

    if [ ! -d "node_modules" ]; then
        echo "Installing frontend dependencies..."
        npm install
    fi

    npm run generate-proto
    echo "✓ TypeScript protobuf files generated successfully"
else
    echo "Warning: npm not found. Skipping TypeScript proto generation."
fi
