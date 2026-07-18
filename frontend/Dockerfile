# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# NOTE: do NOT pass BACKEND_URL at build time for the Lightsail/Caddy setup.
# Caddy routes /api/* and /uploads/* straight to the backend container, so the
# frontend only ever needs same-origin relative URLs. Baking an internal URL
# (http://backend:3001) into NEXT_PUBLIC_BACKEND_URL would break <img> tags in
# the browser.
RUN npm run build

# Runtime stage
FROM node:20-alpine

WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/next.config.mjs ./
COPY --from=builder /app/jsconfig.json ./

EXPOSE 3000

CMD ["npm", "start"]
