# syntax=docker/dockerfile:1
# Build context: backend/ (docker build backend) — same as backend/compose.yaml.
FROM node:22-bookworm-slim AS base
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Compile TypeScript. node_modules keeps dev deps on purpose: the prisma CLI
# (migrate deploy) and tsx (seed / platform:bootstrap) are devDependencies.
FROM base AS build
COPY package*.json ./
RUN npm ci --no-audit --no-fund && npm cache clean --force
COPY . .
RUN npm run db:generate && npm run build

FROM base AS runtime
ENV NODE_ENV=production \
    PORT=4000 \
    NODE_OPTIONS=--max-old-space-size=320
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json tsconfig.json tsconfig.tooling.json ./
# prisma/ = schema + migrations + seeds; seeds and setup/bootstrap.ts import src/.
COPY prisma ./prisma
COPY setup ./setup
COPY src ./src
USER node
EXPOSE 4000
# Production migrations are applied by the deploy workflow (`npx prisma migrate deploy`) before `up -d`.
CMD ["node", "dist/main.js"]
