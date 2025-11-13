sudo docker run --rm --name envoy-grpc-proxy -p 8080:8080 -v $(pwd)/envoy.yaml:/etc/envoy/envoy.yaml --network host envoyproxy/envoy:v1.28-latest
