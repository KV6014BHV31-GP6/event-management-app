# Frozen application artifact; no React/npm rebuild and no product source edits.
ARG NODE_IMAGE=node:24.14.0-bookworm-slim
ARG PYTHON_IMAGE=python:3.14.8-slim-bookworm
FROM ${NODE_IMAGE} AS node_runtime
FROM ${PYTHON_IMAGE} AS app
LABEL org.opencontainers.image.title="NU ROSE-PULSE synthetic demo"
LABEL org.opencontainers.image.revision="0e8bba3863267223ede48ddca35f8bb2017a5e3a"
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_DISABLE_PIP_VERSION_CHECK=1
RUN apt-get update && apt-get install -y --no-install-recommends libstdc++6 \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --gid 10001 nu && useradd --uid 10001 --gid nu --no-create-home nu
COPY --from=node_runtime /usr/local/bin/node /usr/local/bin/node
WORKDIR /opt/nu
COPY release/source/backend/requirements.txt /opt/nu/backend/requirements.txt
RUN python -m pip install --no-cache-dir -r /opt/nu/backend/requirements.txt
COPY release/source/backend/src /opt/nu/backend/src
COPY release/source/backend/scripts /opt/nu/backend/scripts
COPY release/source/frontend/dev-server.mjs /opt/nu/frontend/dev-server.mjs
COPY release/frontend-dist /opt/nu/web
COPY release/RELEASE.json /opt/nu/RELEASE.json
COPY runtime /opt/nu/runtime
RUN mkdir -p /data/uploads /data/private_assets \
    && chown -R 10001:10001 /data
USER 10001:10001
EXPOSE 8080
ENTRYPOINT ["python", "-B", "/opt/nu/runtime/entrypoint.py"]
CMD ["serve"]
