# Weights Studio Frontend - Development Build
FROM node:20-alpine

WORKDIR /app

# Install dependencies first (better caching)
COPY package*.json ./

RUN npm install

# Copy source code
COPY . .

# Expose Vite dev server port
EXPOSE 5173

# Start Vite with host binding for container access
CMD ["npm", "run", "dev", "--host"]
