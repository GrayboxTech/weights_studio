#!/usr/bin/env bash
set -e

# ===================================================================
# Note: If you haven't generated proto files yet, run:
#   ./generate_protos.sh
# ===================================================================

# Change to the repo root (parent of weights_studio/)
cd "$(dirname "$0")/.."

# 1. Detect OS and set the appropriate host address
if [[ "$OSTYPE" == "linux-gnu"* ]]; then
    # Linux: use localhost IP
    GRPC_HOST="127.0.0.1"
elif [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS: use host.docker.internal
    GRPC_HOST="host.docker.internal"
elif [[ "$OSTYPE" == "msys" ]] || [[ "$OSTYPE" == "cygwin" ]]; then
    # Windows (Git Bash / Cygwin)
    GRPC_HOST="host.docker.internal"
else
    # Fallback
    echo "Warning: Unknown OS type '$OSTYPE', defaulting to host.docker.internal"
    GRPC_HOST="host.docker.internal"
fi

echo "Using gRPC host: $GRPC_HOST"

# 2. Generate a temporary envoy config with the correct address
cd weights_studio
sed "s/host\.docker\.internal/$GRPC_HOST/g" envoy.yaml > envoy.tmp.yaml

# 3. Start Envoy with the generated config
echo "Starting Envoy proxy on port 8080..."
docker run --rm \
  --name envoy-grpc-proxy \
  --add-host=host.docker.internal:host-gateway \
  -p 8080:8080 \
  -v "$(pwd)/envoy.tmp.yaml:/etc/envoy/envoy.yaml" \
  envoyproxy/envoy:v1.28-latest

# Clean up temp file when container stops
rm -f envoy.tmp.yaml
