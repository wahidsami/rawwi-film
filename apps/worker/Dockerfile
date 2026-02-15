# apps/worker/Dockerfile
FROM node:20-alpine
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@latest --activate

# Context is root
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml PolicyMap.json ./
COPY apps/worker/package.json ./apps/worker/

RUN pnpm install --frozen-lockfile

COPY apps/worker ./apps/worker

WORKDIR /app/apps/worker
# Run with tsx directly for simplicity
CMD ["npx", "tsx", "src/index.ts", "dev"]
