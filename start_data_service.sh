
#!/bin/bash

# Script to compile proto files and start the data service server

set -e  # Exit on error

echo "=== Starting Data Service Setup ==="

_DEFAULT_DATA_SERVICE_PORT=50051
# Get the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

# Step 1: Compile the proto file
echo "Step 1: Compiling data_service.proto..."
if [ ! -f "data_service.proto" ]; then
    echo "Error: data_service.proto not found in $SCRIPT_DIR"
    exit 1
fi

python -m grpc_tools.protoc \
    -I. \
    --python_out=. \
    --grpc_python_out=. \
    data_service.proto

if [ $? -eq 0 ]; then
    echo "✓ Proto compilation successful"
    echo "  Generated: data_service_pb2.py"
    echo "  Generated: data_service_pb2_grpc.py"
else
    echo "✗ Proto compilation failed"
    exit 1
fi

# Step 2: Check if Ollama is running
echo ""
echo "Step 2: Checking Ollama server..."
if curl -s http://localhost:11434/api/tags > /dev/null 2>&1; then
    echo "✓ Ollama server is running"
else
    echo "⚠ Warning: Ollama server not detected on port 11434"
    echo "  Natural language queries will not work"
    echo "  Start Ollama with: ollama serve"
fi

# Step 3: Start the data service server
echo ""
echo "Step 3: Starting Data Service server on port $_DEFAULT_DATA_SERVICE_PORT..."
echo "=========================================="
python -c "from data_service import serve; serve()"
