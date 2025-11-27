#!/usr/bin/env bash
set -e

# Change to the repo root (parent of weights_studio/)
cd "$(dirname "$0")/.."

# 1. Generate protobuf files (Python + gRPC)
echo "Generating protobuf files..."

# Determine which python to use
if [ -f "./venv/bin/python" ]; then
    PYTHON_CMD="./venv/bin/python"
    echo "Using venv python: $PYTHON_CMD"
else
    PYTHON_CMD="python"
    echo "Using system python: $(which python)"
    echo "Warning: If this is not the correct environment, generation may fail."
fi

$PYTHON_CMD -m grpc_tools.protoc \
    -I./weightslab/weightslab/proto \
    --python_out=./weightslab \
    --grpc_python_out=./weightslab \
    ./weightslab/weightslab/proto/experiment_service.proto

echo "✓ Python protobuf files generated successfully"

# 2. Generate TypeScript protobuf files (Frontend)
echo "Generating TypeScript protobuf files..."

if command -v npm &> /dev/null; then
    # Go to weights_studio directory
    cd weights_studio
    
    # Ensure dependencies are installed (needed for the protoc plugin)
    if [ ! -d "node_modules" ]; then
        echo "Installing frontend dependencies..."
        npm install
    fi
    
    npm run generate-proto
    echo "✓ TypeScript protobuf files generated successfully"
else
    echo "Warning: npm not found. Skipping TypeScript proto generation."
fi
