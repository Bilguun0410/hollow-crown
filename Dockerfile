# Hollow Crown: Bun runs the server and bundles the client (Render has no
# native Bun runtime, so we deploy as a Docker web service).
FROM oven/bun:1.3 AS base
WORKDIR /app
ENV NODE_ENV=production

# Install production dependencies only (sharp/typescript are dev tools).
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

COPY server.js ./
COPY server ./server
COPY src ./src
COPY public ./public

# Fail the image build (not the deploy) if the client doesn't bundle.
RUN bun build ./src/main.jsx --target browser --external phaser --outdir /tmp/bundle-check > /dev/null && rm -rf /tmp/bundle-check

USER bun
EXPOSE 3000
CMD ["bun", "server.js"]
