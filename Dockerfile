# Root deployment Dockerfile for the monorepo dashboard frontend.
# Coolify can build from the repository root, so this file forwards the build to apps/web.

FROM node:20-alpine AS builder
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@latest --activate

# Monorepo root context
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/web/package.json ./apps/web/

RUN pnpm install --frozen-lockfile

COPY apps/web ./apps/web

WORKDIR /app/apps/web
RUN pnpm build

FROM nginx:alpine
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY apps/web/nginx-security-headers.conf /etc/nginx/conf.d/security-headers.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
