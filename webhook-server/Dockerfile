FROM node:20-bullseye

# Install build tools needed for better-sqlite3 native module + omni CLI
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy root-level package files and tsconfig
COPY package.json package-lock.json* tsconfig.json ./

# Install root dependencies (includes better-sqlite3, tsx, ts-node)
RUN npm ci

# Copy the db module (handlers import from ../../../db/client)
COPY db/ ./db/

# Copy webhook-server package files
COPY webhook-server/package.json webhook-server/package-lock.json* ./webhook-server/

# Install webhook-server dependencies
RUN npm ci --prefix webhook-server

# Copy webhook-server source
COPY webhook-server/ ./webhook-server/

# Ensure data directory is writable (Railway Volume mounts at /app/data)
RUN mkdir -p /app/data && chmod 777 /app/data

EXPOSE 3001

# Run with tsx for direct TypeScript execution
CMD ["./node_modules/.bin/tsx", "webhook-server/src/index.ts"]
