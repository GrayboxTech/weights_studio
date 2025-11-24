docker run --rm \
  --name envoy-grpc-proxy \
  --add-host=host.docker.internal:host-gateway \
  -p 8080:8080 \
  -v "$(pwd)/envoy.yaml:/etc/envoy/envoy.yaml" \
  envoyproxy/envoy:v1.28-latest
