# PowerShell script to compile proto files and start the data service server

$ErrorActionPreference = "Stop"

Write-Host "=== Starting Data Service Setup ===" -ForegroundColor Cyan

# Use environment variable if set, otherwise use default
$DATA_SERVICE_PORT = if ($env:DATA_SERVICE_PORT) { $env:DATA_SERVICE_PORT } else { "50051" }

# Get the directory where this script is located
$SCRIPT_DIR = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $SCRIPT_DIR

# Step 1: Compile the proto file
Write-Host ""
Write-Host "Step 1: Compiling data_service.proto..." -ForegroundColor Yellow
if (-not (Test-Path "../proto/data_service.proto")) {
    Write-Host "Error: data_service.proto not found in $SCRIPT_DIR" -ForegroundColor Red
    exit 1
}

python -m grpc_tools.protoc `
    -I"../proto/" `
    --python_out="../proto/" `
    --grpc_python_out="../proto/" `
    "../proto/data_service.proto"

if ($LASTEXITCODE -eq 0) {
    Write-Host "✓ Proto compilation successful" -ForegroundColor Green
    Write-Host "  Generated: data_service_pb2.py"
    Write-Host "  Generated: data_service_pb2_grpc.py"
} else {
    Write-Host "✗ Proto compilation failed" -ForegroundColor Red
    exit 1
}

# Step 2: Check if Ollama is running
Write-Host ""
Write-Host "Step 2: Checking Ollama server..." -ForegroundColor Yellow
$OLLAMA_HOST = if ($env:OLLAMA_HOST) { $env:OLLAMA_HOST } else { "localhost:11434" }

try {
    $response = Invoke-WebRequest -Uri "http://$OLLAMA_HOST/api/tags" -Method Get -TimeoutSec 2 -UseBasicParsing -ErrorAction Stop
    Write-Host "✓ Ollama server is running at $OLLAMA_HOST" -ForegroundColor Green
} catch {
    Write-Host "⚠ Warning: Ollama server not detected at $OLLAMA_HOST" -ForegroundColor Yellow
    Write-Host "  Natural language queries will not work"
    Write-Host "  Start Ollama with: ollama serve"
}

# Step 3: Check if port is already in use
Write-Host ""
Write-Host "Step 3: Checking if port $DATA_SERVICE_PORT is available..." -ForegroundColor Yellow

$portInUse = Get-NetTCPConnection -LocalPort $DATA_SERVICE_PORT -ErrorAction SilentlyContinue
if ($portInUse) {
    Write-Host "✗ Error: Port $DATA_SERVICE_PORT is already in use" -ForegroundColor Red
    Write-Host "  Data service may already be running" -ForegroundColor Yellow
    Write-Host "  Use a different port or stop the existing service" -ForegroundColor Yellow
    exit 1
} else {
    Write-Host "✓ Port $DATA_SERVICE_PORT is available" -ForegroundColor Green
}
