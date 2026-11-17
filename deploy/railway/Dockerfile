# Railway synthetic staging only. Rebuild product from exact GitHub source, not the old portable artifact.
FROM node:24.14.0-bookworm-slim AS node_runtime
FROM node_runtime AS web_build
WORKDIR /build/frontend/rose-pulse-react
COPY frontend/rose-pulse-react/package.json frontend/rose-pulse-react/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/rose-pulse-react/ ./
COPY frontend/live /build/frontend/live
ARG RAILWAY_GIT_COMMIT_SHA
ARG NU_PRODUCT_SHA
RUN source_sha="${RAILWAY_GIT_COMMIT_SHA:-${NU_PRODUCT_SHA}}" \
    && printf '%s' "$source_sha" | grep -Eq '^[0-9a-f]{40}$' \
    && test "$source_sha" != 0000000000000000000000000000000000000000 \
    && VITE_DEMO_PROFILE=synthetic VITE_DEMO_BUILD_SHA="$source_sha" npm run build \
    && printf '{"source_sha":"%s","profile":"synthetic-staging"}\n' "$source_sha" > dist/nu-source.json

FROM python:3.14.8-slim-bookworm AS runtime
ARG RAILWAY_GIT_COMMIT_SHA
ARG NU_PRODUCT_SHA
LABEL org.opencontainers.image.revision="${RAILWAY_GIT_COMMIT_SHA:-${NU_PRODUCT_SHA}}" nu.demo.profile="synthetic-staging"
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_DISABLE_PIP_VERSION_CHECK=1
RUN apt-get update && apt-get install -y --no-install-recommends gosu libstdc++6 ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --gid 10001 nu && useradd --uid 10001 --gid nu --no-create-home nu
COPY --from=node_runtime /usr/local/bin/node /usr/local/bin/node
WORKDIR /opt/nu
COPY backend/requirements.txt /opt/nu/backend/requirements.txt
RUN python -m pip install --no-cache-dir -r /opt/nu/backend/requirements.txt
COPY backend/src /opt/nu/backend/src
COPY backend/scripts /opt/nu/backend/scripts
COPY deploy/railway/seed-assets /opt/nu/deploy/railway/seed-assets
COPY frontend/dev-server.mjs /opt/nu/frontend/dev-server.mjs
COPY --from=web_build /build/frontend/rose-pulse-react/dist /opt/nu/web
COPY deploy/railway/entrypoint.py /opt/nu/deploy/railway/entrypoint.py
COPY deploy/railway/registration_groups_staging.py /opt/nu/deploy/railway/registration_groups_staging.py
COPY deploy/railway/gateway.mjs /opt/nu/deploy/railway/gateway.mjs
COPY deploy/railway/start.sh /opt/nu/deploy/railway/start.sh
RUN chmod 755 /opt/nu/deploy/railway/start.sh \
    && mkdir -p /data/uploads /data/private_assets \
    && chown -R 10001:10001 /data
EXPOSE 8080
ENTRYPOINT ["/opt/nu/deploy/railway/start.sh"]
