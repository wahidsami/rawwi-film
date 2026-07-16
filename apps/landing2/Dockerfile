# apps/landing2/Dockerfile
FROM node:20-alpine AS builder
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@latest --activate

# Monorepo root context
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/landing2/package.json ./apps/landing2/

RUN pnpm install --frozen-lockfile

COPY apps/landing2 ./apps/landing2

WORKDIR /app/apps/landing2
RUN pnpm build

FROM nginx:alpine
COPY --from=builder /app/apps/landing2/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
