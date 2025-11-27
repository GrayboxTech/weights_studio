#!/usr/bin/env bash
set -euo pipefail

# Change to the repo root
cd "$(dirname "$0")/.."

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

PROTO_ROOT="weightslab/weightslab"
PROTO_FILE="$PROTO_ROOT/proto/experiment_service.proto"

# 1) Generate Python + gRPC stubs
$PYTHON_CMD -m grpc_tools.protoc \
    -I"$PROTO_ROOT" \
    --python_out="$PROTO_ROOT" \
    --grpc_python_out="$PROTO_ROOT" \
    "$PROTO_FILE"

echo "✓ Python protobuf files generated successfully"

# 1b) Patch imports in generated gRPC file
GRPC_FILE="$PROTO_ROOT/proto/experiment_service_pb2_grpc.py"

if [ -f "$GRPC_FILE" ]; then
    # macOS sed: need '' after -i
    sed -i '' 's/^from proto import experiment_service_pb2 as /from . import experiment_service_pb2 as /' "$GRPC_FILE"
    echo "✓ Patched imports in $GRPC_FILE"
else
    echo " $GRPC_FILE not found – did protoc run correctly?"
fi

# 2) Generate TypeScript protobuf files (Frontend)
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
