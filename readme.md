# WeightsLab UX

WeightsLab UX is the on-premise, data-facing frontend for the WeightsLab machine learning framework. It is a TypeScript-based application designed for visualizing datasets and interacting with ML experiments.

## Overview

This application serves as the primary user interface for exploring data, such as the KITTI dataset, and monitoring experiment progress. It communicates with the backend services via gRPC-web.

The UI supports experiments based on architectures like VoxelNet, shown below.

![On-premise Architecture](architecture.png)

## Tech Stack

- **TypeScript**: Core language for development.
- **Vite**: Frontend tooling for development and builds.
- **Protocol Buffers / gRPC-web**: For type-safe API communication with the backend.

## Getting Started

### Prerequisites

- Node.js and npm
- Access to the backend gRPC services.

### Installation

Install the project dependencies.

```bash
npm install