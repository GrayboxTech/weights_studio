# Docker Deployment Guide

## Prerequisites

- Docker Desktop (with WSL2 backend on Windows)
- Docker Compose v2+
- NVIDIA GPU + Docker GPU support (optional, for Ollama acceleration)

## Architecture

```
┌─────────────────┐     ┌──────────────┐     ┌────────────────┐
│  Vite Frontend  │────▶│ Envoy Proxy  │────▶│ Python gRPC   │
│  (port 5173)    │     │ (port 8080)  │     │ (host:50051)   │
└─────────────────┘     └──────────────┘     └────────────────┘
         │                                              ▲
         │                                              │
         ▼                                              │
┌─────────────────┐                                     │
│  Local LLM      │                                     │
│   Optional      │                                     │
│  (port 11435)   │─────────────────────────────────────┘
└─────────────────┘
```

## Quick Start

### 1. Start Python gRPC Backend (Host)

```powershell
cd c:\Users\GuillaumePELLUET\Documents\Codes\weightslab\examples\data\ws-classification\main.py
python main.py
```

This starts the gRPC server on `0.0.0.0:50051`.

### 2. Launch Docker Services

```powershell
cd c:\Users\GuillaumePELLUET\Documents\Codes\weights_studio
docker-compose up  # ollama won't start
docker-compose --profile ollama up  # ollama will start also
```

This starts:
- **Envoy Proxy** on port 8080 (gRPC-Web bridge)
- **Vite Dev Server** on port 5173 (frontend)
- **Ollama** on port 11435 (Optional: LLM inference)

### 3. Access the Application

Open browser: http://localhost:5173

## Service Management

```powershell
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f

# View specific service logs
docker-compose logs -f weights_studio

# Stop all services
docker-compose down

# Rebuild after code changes
docker-compose up -d --build

# Stop and remove volumes
docker-compose down -v
```

## Port Mapping

| Service        | Container Port | Host Port | Purpose              |
|----------------|----------------|-----------|----------------------|
| weights_studio | 5173           | 5173      | Vite dev server      |
| envoy          | 8080           | 8080      | gRPC-Web endpoint    |
| envoy          | 9901           | 9901      | Envoy admin UI       |
| ollama         | 11434          | 11435     | Ollama API           |
| grpc_backend   | 50051          | 50051     | Python gRPC (host)   |

## GPU Support for Ollama

If you have an NVIDIA GPU:

1. Install [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/install-guide.html)
2. The `docker-compose.yml` already includes GPU configuration
3. Verify GPU access:

```powershell
docker-compose exec ollama nvidia-smi
```

If no GPU is available, edit `docker-compose.yml` and comment out the `deploy.resources` section.

## Loading Ollama Models

```powershell
# Pull a model (run after starting services)
docker-compose exec ollama ollama pull llama2

# List available models
docker-compose exec ollama ollama list

# Run interactive chat (testing)
docker-compose exec ollama ollama run llama2
```

## Development Workflow

### Hot Reload

The `weights_studio` service mounts your local directory, so changes to TypeScript/HTML/CSS files will trigger Vite hot reload automatically.

### Updating Dependencies

```powershell
# Install new npm package
docker-compose exec weights_studio npm install <package-name>

# Rebuild container
docker-compose up -d --build weights_studio
```

### Debugging

**Envoy Admin Interface**: http://localhost:9901
- View cluster stats, logs, and config

**Check Envoy → gRPC connectivity**:
```powershell
docker-compose exec envoy curl -v http://host.docker.internal:50051
```

**View container logs**:
```powershell
docker-compose logs -f weights_studio
docker-compose logs -f envoy
docker-compose logs -f ollama
```

## Troubleshooting

### Envoy can't reach Python gRPC backend

**Symptom**: `upstream connect error or disconnect/reset before headers` in Envoy logs

**Solution**: Ensure Python gRPC server is running on host at `0.0.0.0:50051`:
```powershell
netstat -an | findstr 50051
```

### Vite not accessible from host

**Symptom**: Can't access http://localhost:5173

**Solution**: Check Vite is bound to `0.0.0.0`:
```powershell
docker-compose exec weights_studio netstat -tln | grep 5173
```

### Ollama models download slowly

**Solution**: Pre-pull models before starting:
```powershell
docker-compose up -d ollama
docker-compose exec ollama ollama pull llama2
```

### GPU not detected in Ollama

**Solution**: Verify NVIDIA Container Toolkit:
```powershell
docker run --rm --gpus all nvidia/cuda:11.8.0-base-ubuntu22.04 nvidia-smi
```

## Production Considerations

This setup uses `npm run dev` for hot reload. For production:

1. Update `Dockerfile.studio` to use multi-stage build:
   ```dockerfile
   FROM node:20-alpine AS builder
   WORKDIR /app
   COPY package*.json ./
   RUN npm ci
   COPY . .
   RUN npm run build

   FROM nginx:alpine
   COPY --from=builder /app/dist /usr/share/nginx/html
   EXPOSE 80
   ```

2. Update `docker-compose.yml` port mapping for weights_studio to `80:80`

3. Remove volume mounts (use built assets)

4. Use `docker-compose -f docker-compose.prod.yml up -d`

## Environment Variables

Copy `.env.example` to `.env` and customize:

```powershell
cp .env.example .env
```

Edit `.env`:
```ini
OLLAMA_HOST=http://localhost:11435
OLLAMA_MODEL=llama2
VITE_GRPC_WEB_URL=http://localhost:8080
```

## Cleanup

Remove all containers, networks, and volumes:
```powershell
docker-compose down -v
docker system prune -a
```
