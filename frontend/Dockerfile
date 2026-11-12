# syntax=docker/dockerfile:1
# Build context: frontend/ (docker build frontend) — same as backend/compose.yaml.
FROM node:22-bookworm-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package*.json ./
RUN npm ci --no-audit --no-fund
COPY . .
# The browser calls same-origin /api/*; Next.js rewrites proxy it to API_INTERNAL_URL.
# Rewrites are resolved at build time, so this is a build arg (the deploy workflow sets
# it to the backend container on the shared Docker network). Set it at runtime too for
# src/proxy.ts and server-side fetches.
ARG API_INTERNAL_URL=http://api:4000
ENV API_INTERNAL_URL=$API_INTERNAL_URL
RUN npm run build

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    HOSTNAME=0.0.0.0 \
    PORT=3000 \
    NEXT_TELEMETRY_DISABLED=1 \
    NODE_OPTIONS=--max-old-space-size=256
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
USER node
EXPOSE 3000
CMD ["node", "server.js"]
