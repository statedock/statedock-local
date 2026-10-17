# StateDock self-hosted image: the same Local Server as the desktop and Linux releases,
# started in server mode. Data lives in /data (statedock.db, backups, agent_token).
FROM node:22-bookworm-slim AS builder
WORKDIR /src
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate
COPY . .
RUN pnpm install --frozen-lockfile && pnpm build && node scripts/package.mjs

FROM node:22-bookworm-slim
WORKDIR /app
COPY --from=builder /src/release-bundle /app
ENV NODE_ENV=production \
    PORT=3000 \
    STATEDOCK_HOST=0.0.0.0 \
    DATA_DIR=/data
# Runs as root like the former statedock-docker image, so existing root-owned ./data volumes keep working.
RUN mkdir -p /data
VOLUME ["/data"]
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/index.js", "--no-open"]
