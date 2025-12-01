# PowerShell script to generate TypeScript protobuf files

$ErrorActionPreference = "Stop"

# Generate TypeScript protobuf files (Frontend)
Write-Host "Generating TypeScript protobuf files..." -ForegroundColor Cyan

# Check if npm is available
$npmExists = Get-Command npm -ErrorAction SilentlyContinue

Test-Path ../../weightslab/weightslab/proto/experiment_service.proto
(Resolve-Path ../../weightslab/weightslab/proto).Path
(Resolve-Path ..\node_modules\.bin\protoc-gen-ts.cmd).Path

$PROTO_DIR = (Resolve-Path ../../weightslab/weightslab/proto).Path
$PLUGIN_TS = (Resolve-Path ..\node_modules\.bin\protoc-gen-ts.cmd).Path
npx grpc_tools_node_protoc -I "$PROTO_DIR" --js_out=import_style=commonjs,binary:../src --grpc_out=grpc_js:../src --plugin=protoc-gen-ts="$PLUGIN_TS" "$PROTO_DIR\experiment_service.proto"

Remove-Item -Recurse -Force "..\src\*.{js,ts}"
