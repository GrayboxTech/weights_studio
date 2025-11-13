# WeightsLab UX

WeightsLab UX is the on-premise, data-facing frontend for the WeightsLab machine learning framework. It is a TypeScript-based application designed for visualizing datasets and interacting with ML experiments.

## Overview

This application serves as the primary user interface for exploring data, order, group, add slices and discard samples that are deemed unnecessary.

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