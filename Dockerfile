FROM node:26-alpine AS client-build
WORKDIR /app/client
COPY client/package.json client/package-lock.json* ./
RUN npm install --no-audit --no-fund
COPY client/ ./
RUN npm run build

FROM node:26-alpine
RUN echo "os-refresh 2026-11-22" && apk upgrade --no-cache \
  && apk add --no-cache ffmpeg

WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0 \
    DATA_DIR=/app/data

COPY package.json package-lock.json* ./
RUN npm install --omit=dev --no-audit --no-fund
COPY server ./server
COPY --from=client-build /app/client/dist ./client/dist
RUN mkdir -p /app/data/uploads && chown -R node:node /app/data

USER node
EXPOSE 3000
CMD ["node", "server/index.js"]
