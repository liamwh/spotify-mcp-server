# syntax=docker/dockerfile:1

# ---- build stage: install deps and compile TypeScript ----
FROM oven/bun:1 AS build
WORKDIR /app

# Install dependencies first for better layer caching.
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# Compile with tsc only. The package.json "build" script additionally chmods the
# bin entries via `node -e`, which is unnecessary when invoking the compiled JS
# directly (the container runs `bun build/http.js`) and `node` is not present in
# a bun-only image.
COPY tsconfig.json ./
COPY src ./src
RUN bunx tsc

# ---- runtime stage: compiled output + dependencies ----
FROM oven/bun:1 AS runtime
WORKDIR /app

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/build ./build
COPY package.json ./

# Bind on all interfaces inside the container; the reverse proxy fronts it.
# Spotify config lives on a mounted persistent volume (/data) so refreshed
# tokens survive restarts. Basic auth is enabled by setting MCP_BASIC_AUTH_*.
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8001 \
    SPOTIFY_CONFIG_PATH=/data/spotify-config.json

RUN mkdir -p /data

EXPOSE 8001

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD bun -e "fetch('http://127.0.0.1:8001/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["bun", "build/http.js"]
