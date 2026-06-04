FROM node:22-alpine AS web-builder
WORKDIR /build/web
COPY web/package*.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

FROM node:22-alpine AS server-builder
WORKDIR /build/server
COPY server/package*.json ./
RUN npm ci
COPY server/ ./
RUN npm run build

FROM node:22-alpine
RUN apk add --no-cache git
WORKDIR /app

COPY --from=server-builder /build/server/dist ./dist
COPY --from=server-builder /build/server/node_modules ./node_modules
COPY --from=server-builder /build/server/package.json ./
COPY --from=web-builder /build/web/dist ./public

ENV NODE_ENV=production
ENV DATA_DIR=/data
ENV PORT=3000

EXPOSE 3000
VOLUME ["/data"]

CMD ["node", "dist/index.js"]
