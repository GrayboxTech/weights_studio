# WeightsLab & Weights Studio Setup Guide

This guide explains how to set up and run the **WeightsLab** backend and the **Weights Studio** frontend for local development.

**Quick Summary:** 
1. **Clone** repositories
2. **Setup** Python environment
3. **Configure** Docker
4. **Run** training script

---

## Architecture Overview

The system consists of three main components:
1.  **Weightslab (Backend)**: Python-based ML framework and gRPC server that manages training, datasets, and model weights.
2.  **Weights Studio (Frontend)**: Vite-based TypeScript application for visualizing results and interacting with experiments.
3.  **Infrastructure (Sidecars)**: 
    *   **Envoy Proxy**: Translates between gRPC (Backend) and gRPC-web (Browser).
    *   **Ollama**: Provides local LLM capabilities for chat-based interactions.

---

## Prerequisites

- **Python 3.11**
- **Node.js** (v18+ recommended)
- **Docker** and **Docker Compose**
- **Git**

---

## 0. Cloning the Repositories

First, clone both the framework and the UI repositories into the same parent directory:

```bash
# Clone the backend framework
git clone git@github.com:GrayboxTech/weightslab.git

# Clone the frontend (Weights Studio)
git clone git@github.com:GrayboxTech/weights_studio.git
```

Checkout to your preferred branch (e.g., `dev`):
```bash
cd weightslab
git checkout dev

cd ../weights_studio
git checkout dev
```

---

## 1. Backend Setup (Weightslab)

1.  **Create and activate a virtual environment**:
    ```bash
    # From the repository root
    python3.11 -m venv venv
    source venv/bin/activate  # On Windows: .\venv\Scripts\activate
    ```

2.  **Install dependencies**:
    ```bash
    cd weightslab
    pip install -r requirements.txt
    ```

3.  **Install `weightslab` in editable mode**:
    This allows you to modify the code and see changes reflected immediately without reinstalling.
    ```bash
    pip install -e .
    ```

---

## 2. Frontend Setup (Weights Studio)

1.  **Configure Environment Variables**:
    Load the default environment variables required for the Docker services and local development.
    ```bash
    cd weights_studio/docker
    source source-env.sh  # On Windows: .\source-env.ps1
    ```

---

## 3. Running the Stack

You need to run the following services.

### Step A: Start Frontend & Sidecar Services (Docker)
This starts **Weights Studio**, **Envoy** (for gRPC communication), and **Ollama** (for LLMs).
```bash
cd weights_studio/docker
docker compose up -d
```
The UI will be accessible at: [http://localhost:5173](http://localhost:5173)

### Step B: Start a Training Experiment (Backend)
Run a training script that integrates with `weightslab`. This script will host the gRPC service that the frontend connects to.
```bash
# Ensure your venv is activated
# Example: Running the MNIST training demo
python weightslab/weightslab/examples/ws-classification/mnist_training.py
```

---

## 4. Verification Checklist

- [ ] **Envoy Admin**: [http://localhost:9901](http://localhost:9901) (Check if proxying is healthy)
- [ ] **Ollama API**: [http://localhost:11435](http://localhost:11435)
- [ ] **Weights Studio**: [http://localhost:5173](http://localhost:5173) (Check if the UI loads)
- [ ] **Backend Connection**: In Weights Studio, you should see the training progress and metrics once the backend script is running.

---

## Developer Tips

### Generating Protocol Buffers
If you modify the gRPC service definition (`.proto` files) in `weightslab`, you must regenerate the TypeScript types for the frontend:
```bash
cd weights_studio
npm run generate-proto
```

### Checking Logs
- **Docker Logs**: `docker compose logs -f`
- **Frontend Logs**: Visible in the terminal where `npm run dev` is running.
- **Backend Logs**: Visible in the terminal where your training script is running.
