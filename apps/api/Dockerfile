# Build context is the repo root (npm workspaces) — see docker-compose.yml.
# syntax=docker/dockerfile:1

FROM node:20-alpine AS build
WORKDIR /repo
COPY package.json package-lock.json ./
COPY apps/api ./apps/api
COPY packages/contracts ./packages/contracts
RUN npm ci
RUN npm run build -w @fastpay/contracts --if-present
RUN npm run build -w apps/api --if-present

# Prune devDependencies out of the already-built tree instead of re-running a
# fresh `npm ci --omit=dev` (which would re-trigger packages/contracts'
# "prepare" build script without a `tsc` binary available).
FROM node:20-alpine AS prune
WORKDIR /repo
COPY --from=build /repo ./
RUN npm prune --omit=dev

FROM node:20-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /repo
COPY --from=prune /repo/node_modules ./node_modules
COPY --from=prune /repo/apps/api/package.json ./apps/api/package.json
COPY --from=prune /repo/apps/api/dist ./apps/api/dist
COPY --from=prune /repo/packages/contracts/package.json ./packages/contracts/package.json
COPY --from=prune /repo/packages/contracts/dist ./packages/contracts/dist

WORKDIR /repo/apps/api
EXPOSE 4000
CMD ["node", "dist/server.js"]
