# Zooptrack AdSpy worker. Build from the REPO ROOT:
#   docker compose -f worker/docker-compose.yml build
#
# Node 22 matches package.json "engines" (the version Vercel actually runs).
FROM node:22-bookworm-slim

ENV NODE_ENV=production \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
    NEXT_TELEMETRY_DISABLED=1

WORKDIR /app

# Dependencies first (cached layer). Dev deps are needed for tsx.
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund --include=dev \
 && npx playwright-core install --with-deps chromium \
 && rm -rf /root/.npm /var/lib/apt/lists/*

# "server-only" throws outside Next.js; the worker is server-side by definition.
RUN mkdir -p node_modules/server-only \
 && printf '{"name":"server-only","version":"0.0.1","main":"index.js"}' > node_modules/server-only/package.json \
 && printf '' > node_modules/server-only/index.js

# Only what the worker imports.
COPY tsconfig.json ./
COPY lib ./lib
COPY scripts ./scripts
COPY worker ./worker

# Non-root user with its own temp dir. Everything Chromium writes goes here,
# so the worker can safely delete it between jobs.
RUN useradd --create-home --uid 10001 adspy \
 && mkdir -p /work/tmp \
 && chown -R adspy:adspy /work /ms-playwright
USER adspy
ENV TMPDIR=/work/tmp

EXPOSE 8787
CMD ["npx", "tsx", "worker/adspy-worker.ts"]
