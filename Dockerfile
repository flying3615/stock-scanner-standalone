FROM node:20-slim

WORKDIR /app

# Install system dependencies (openssl for Prisma)
RUN apt-get update -y && apt-get install -y openssl

# Copy root package files
COPY package*.json ./

# Copy frontend package files
COPY frontend/package*.json ./frontend/

# Install root dependencies (including devDependencies for tsx/prisma)
RUN npm install

# Install frontend dependencies
RUN cd frontend && npm install

# Copy source code
COPY . .

# Build Frontend
RUN cd frontend && npm run build

# Generate Prisma Client
RUN npx prisma generate

# Create directory for SQLite persistence
RUN mkdir -p /app/data

# Environment variables (Can be overridden by docker-compose)
ENV PORT=3000
ENV DATABASE_URL="file:/app/data/dev.db"
ENV NODE_ENV=production

# Expose port
EXPOSE 3000

# Start Server (Run migrate then start)
# Using 'npx prisma migrate deploy' to ensure DB schema is up to date
CMD npx prisma migrate deploy && npm run server
