FROM oven/bun:1.3.11-slim AS base

WORKDIR /app

COPY package.json bun.lock* ./
COPY packages ./packages
COPY apps ./apps

RUN bun install --frozen-lockfile

WORKDIR /app/apps/be

ENV NODE_ENV=production

EXPOSE 3000

CMD ["bun", "run", "start"]
