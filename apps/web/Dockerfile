# apps/web/Dockerfile
# Keep the legacy web deployment path serving the new landing2 experience.
FROM node:20-alpine AS builder
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@latest --activate

# Context is root of monorepo
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/landing2/package.json ./apps/landing2/

RUN pnpm install --frozen-lockfile

COPY apps/landing2 ./apps/landing2

WORKDIR /app/apps/landing2
# Build Args
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ARG VITE_API_BASE_URL

ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL

RUN pnpm build

# Serve
FROM nginx:alpine
COPY --from=builder /app/apps/landing2/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
