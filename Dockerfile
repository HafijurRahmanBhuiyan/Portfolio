FROM node:25-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM node:25-alpine AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
ARG API_INTERNAL_URL=http://api:4000
ENV API_INTERNAL_URL=$API_INTERNAL_URL
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:25-alpine AS prod-deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

FROM node:25-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
# Do not set PORT here. The API prefers Render's injected PORT, and Docker
# Compose configures the API with API_PORT=4000. A baked-in PORT=3000 would win
# over API_PORT and break the Compose network contract.
ENV UPLOAD_DIR=/app/uploads
RUN addgroup -S app && adduser -S app -G app
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/app ./app
COPY --from=builder /app/public ./public
COPY --from=builder /app/server.js ./server.js
COPY --from=builder /app/lib ./lib
COPY --from=builder /app/migrations ./migrations
COPY --from=builder /app/projects.json ./projects.json
COPY --from=builder /app/index.html ./index.html
COPY --from=builder /app/developer.html ./developer.html
COPY --from=builder /app/next.config.mjs ./next.config.mjs
COPY --from=builder /app/package.json ./package.json
RUN mkdir -p /app/uploads && chown -R app:app /app
USER app
EXPOSE 3000
COPY --from=builder /app/scripts/start-web.mjs ./scripts/start-web.mjs
CMD ["node", "scripts/start-web.mjs"]
