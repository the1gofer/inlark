# Self-hosted web version of inlark: the mail service runs here and you use it from a browser.
# See docs/self-hosting.md.
FROM node:24-bookworm-slim AS build
WORKDIR /src
ENV ELECTRON_SKIP_BINARY_DOWNLOAD=1 \
    CI=true
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile --filter @inlark/desktop...
RUN pnpm --filter @inlark/desktop build:web-server

FROM node:24-bookworm-slim
ENV NODE_ENV=production \
    INLARK_DATA_DIR=/data \
    PORT=8080
WORKDIR /app
COPY --from=build /src/apps/desktop/out/server ./server
COPY --from=build /src/apps/desktop/out/web ./web
COPY LICENSE ./
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/healthz').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node", "--disable-warning=ExperimentalWarning", "server/index.js"]
