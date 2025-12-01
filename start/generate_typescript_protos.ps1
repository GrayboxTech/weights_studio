# PowerShell script to generate TypeScript protobuf files

$ErrorActionPreference = "Stop"

# Change to the repo root
$REPO_ROOT = Split-Path -Parent $PSScriptRoot
Set-Location $REPO_ROOT

# Generate TypeScript protobuf files (Frontend)
Write-Host "Generating TypeScript protobuf files..." -ForegroundColor Cyan

# Check if npm is available
$npmExists = Get-Command npm -ErrorAction SilentlyContinue

if ($npmExists) {
    # Set-Location weights_studio

    if (-not (Test-Path "node_modules")) {
        Write-Host "Installing frontend dependencies..." -ForegroundColor Yellow
        npm install
    }

    npm run generate-proto
    Write-Host "✓ TypeScript protobuf files generated successfully" -ForegroundColor Green
} else {
    Write-Host "Warning: npm not found. Skipping TypeScript proto generation." -ForegroundColor Yellow
}
