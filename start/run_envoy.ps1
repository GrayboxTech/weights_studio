# PowerShell script to run Envoy proxy for gRPC-Web
# Requires Docker Desktop for Windows

$ErrorActionPreference = "Stop"

# ===================================================================
# Note: If you haven't generated proto files yet, run:
#   .\generate_protos.ps1
# ===================================================================

# 1. Set the appropriate host address for Windows
$GRPC_HOST = "host.docker.internal"
# $GRPC_HOST = "127.0.0.1"

Write-Host "Using gRPC host: $GRPC_HOST" -ForegroundColor Cyan

# 2. Read the envoy.yaml and replace the host
$envoyConfig = Get-Content "../envoy/envoy.yaml" -Raw
$envoyConfig = $envoyConfig -replace "host\.docker\.internal", $GRPC_HOST
$envoyConfig | Out-File "../envoy/envoy.tmp.yaml" -Encoding UTF8

# 3. Start Envoy with the generated config
Write-Host "Starting Envoy proxy on port 8080..." -ForegroundColor Green

docker run -d --rm `
  --name envoy-grpc-proxy `
  --add-host=host.docker.internal:host-gateway `
  -p 8080:8080 `
  -v "../envoy/envoy.tmp.yaml:/etc/envoy/envoy.yaml" `
  envoyproxy/envoy:v1.28-latest

if ($LASTEXITCODE -eq 0) {
    Write-Host "✓ Envoy proxy started in background" -ForegroundColor Green
    Write-Host "  View logs: docker logs envoy-grpc-proxy" -ForegroundColor Gray
    Write-Host "  Stop: docker stop envoy-grpc-proxy" -ForegroundColor Gray
    Write-Host ""
    Write-Host "Note: Temp config file will remain at ../envoy/envoy.tmp.yaml" -ForegroundColor Yellow
    Write-Host "      It will be cleaned up when you stop the container" -ForegroundColor Yellow
} else {
    Write-Host "✗ Failed to start Envoy proxy" -ForegroundColor Red
    # Clean up temp file on failure
    if (Test-Path "../envoy/envoy.tmp.yaml") {
        Remove-Item "../envoy/envoy.tmp.yaml" -Force
    }
    exit 1
}
