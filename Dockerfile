# v0.8.6-rc1

# Base node image
FROM alpine:3.24 AS node

RUN set -eux; \
    for i in 1 2 3 4 5; do \
        apk update \
        && apk upgrade --no-cache \
        && apk add --no-cache nodejs npm python3 py3-pip uv jemalloc \
        && break; \
        echo "apk install failed; retrying $i/5"; \
        rm -rf /var/cache/apk/* /tmp/*; \
        sleep 10; \
    done; \
    addgroup -S node; \
    adduser -S node -G node

# Set environment variable to use jemalloc
ENV LD_PRELOAD=/usr/lib/libjemalloc.so.2

# Add `uv` for extended MCP support
COPY --from=ghcr.io/astral-sh/uv:0.9.5-python3.12-alpine /usr/local/bin/uv /usr/local/bin/uvx /bin/
RUN uv --version

# Set configurable max-old-space-size with default
ARG NODE_MAX_OLD_SPACE_SIZE=6144
ARG NPM_CI_TIMEOUT_SECONDS=1500
ARG NPM_CI_ATTEMPTS=2

RUN mkdir -p /app && chown node:node /app
WORKDIR /app

USER node

COPY --chown=node:node package.json package-lock.json ./
COPY --chown=node:node api/package.json ./api/package.json
COPY --chown=node:node client/package.json ./client/package.json
COPY --chown=node:node packages/data-provider/package.json ./packages/data-provider/package.json
COPY --chown=node:node packages/data-schemas/package.json ./packages/data-schemas/package.json
COPY --chown=node:node packages/api/package.json ./packages/api/package.json

RUN \
    touch .env ; \
    # Create directories for the volumes to inherit the correct permissions
    mkdir -p /app/client/public/images /app/logs /app/uploads ; \
    npm config set fetch-retry-maxtimeout 600000 ; \
    npm config set fetch-retries 5 ; \
    npm config set fetch-retry-mintimeout 15000 ; \
    attempt=1 ; \
    until timeout "$NPM_CI_TIMEOUT_SECONDS" npm install --legacy-peer-deps --ignore-scripts --no-audit ; do \
        status=$? ; \
        if [ "$attempt" -ge "$NPM_CI_ATTEMPTS" ]; then \
            exit "$status" ; \
        fi ; \
        echo "npm install --legacy-peer-deps --ignore-scripts --no-audit failed with exit code $status; retrying attempt $((attempt + 1))/$NPM_CI_ATTEMPTS" ; \
        attempt=$((attempt + 1)) ; \
        npm cache clean --force || true ; \
        sleep 10 ; \
    done

COPY --chown=node:node . .

RUN \
    # React client build with configurable memory
    NODE_OPTIONS="--max-old-space-size=${NODE_MAX_OLD_SPACE_SIZE}" npm run frontend; \
    npm prune --production; \
    rm -rf /usr/local/include/node; \
    npm cache clean --force

# Re-apply patched package versions after npm prune for Vanta high/medium findings.
RUN node -e 'const fs=require("fs"); const p="package.json"; const pkg=JSON.parse(fs.readFileSync(p,"utf8")); const names=["hono","multer","undici","uuid","form-data","protobufjs","nodemailer","dompurify","@opentelemetry/core","file-type"]; if (pkg.overrides) { for (const n of names) delete pkg.overrides[n]; } fs.writeFileSync(p, JSON.stringify(pkg,null,2));' \
    && npm install --force --legacy-peer-deps --ignore-scripts --no-audit --omit=dev --save=false \
    hono@4.12.25 \
    multer@3.0.0-alpha.2 \
    undici@8.5.0 \
    uuid@13.0.1 \
    form-data@4.0.6 \
    protobufjs@8.6.5 \
    nodemailer@9.0.1 \
    dompurify@3.4.11 \
    @opentelemetry/core@2.8.0 \
    file-type@21.3.2 \
    && rm -rf /app/node_modules/gaxios/node_modules/uuid \
    && mkdir -p /app/node_modules/gaxios/node_modules \
    && cp -a /app/node_modules/uuid /app/node_modules/gaxios/node_modules/uuid \
    && rm -rf /app/node_modules/@langchain/google-common/node_modules/uuid \
    && mkdir -p /app/node_modules/@langchain/google-common/node_modules \
    && cp -a /app/node_modules/uuid /app/node_modules/@langchain/google-common/node_modules/uuid \
    && rm -rf /app/node_modules/@hyperdx/otel-web-session-recorder/node_modules/protobufjs \
    && mkdir -p /app/node_modules/@hyperdx/otel-web-session-recorder/node_modules \
    && cp -a /app/node_modules/protobufjs /app/node_modules/@hyperdx/otel-web-session-recorder/node_modules/protobufjs \
    && find /app/node_modules/@opentelemetry -path "*/node_modules/@opentelemetry/core" -type d -prune -exec rm -rf {} + \
    && find /app/node_modules/@opentelemetry -path "*/node_modules/@opentelemetry" -type d -exec sh -c 'mkdir -p "$1"; cp -a /app/node_modules/@opentelemetry/core "$1/core"' sh {} \; \
    && rm -rf /app/api/node_modules/nodemailer \
    && mkdir -p /app/api/node_modules \
    && cp -a /app/node_modules/nodemailer /app/api/node_modules/nodemailer \
    && rm -rf /app/node_modules/stream-file-type/node_modules/file-type \
    && mkdir -p /app/node_modules/stream-file-type/node_modules \
    && cp -a /app/node_modules/file-type /app/node_modules/stream-file-type/node_modules/file-type \
    && rm -f /app/packages/data-provider/react-query/package-lock.json \
    && rm -f /app/node_modules/@monaco-editor/loader/playground/package-lock.json \
    && npm cache clean --force
USER root
# Remove npm tooling from final image for Vanta/AWS Inspector.
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx /usr/lib/node_modules/npm /usr/bin/npm /usr/bin/npx /home/node/.npm
USER node

# Optional build metadata surfaced in Settings -> About for support triage.
# Declared here (after the heavy install/build steps) so that commit/date
# changing on every CI run does not bust the cache for dependency install
# and frontend build layers. When unset, the backend falls back to local
# git resolution (if .git is present), and finally to empty values.
ARG BUILD_COMMIT=
ARG BUILD_BRANCH=
ARG BUILD_DATE=
ENV BUILD_COMMIT=${BUILD_COMMIT}
ENV BUILD_BRANCH=${BUILD_BRANCH}
ENV BUILD_DATE=${BUILD_DATE}

# Node API setup
EXPOSE 3080
ENV HOST=0.0.0.0
ENV NODE_ENV=production
CMD ["node", "api/server/index.js"]

# Optional: for client with nginx routing
# FROM nginx:stable-alpine AS nginx-client
# WORKDIR /usr/share/nginx/html
# COPY --from=node /app/client/dist /usr/share/nginx/html
# COPY client/nginx.conf /etc/nginx/conf.d/default.conf
# ENTRYPOINT ["nginx", "-g", "daemon off;"]
