# l00prite CLI-OS — zero external npm dependencies, so the image is just Node + source.
FROM node:22-alpine

WORKDIR /app
COPY . .
RUN chmod +x install/docker-entrypoint.sh bin/cli.js

# Container runtime config. Binding 0.0.0.0 is an explicit opt-in (LOOPRITE_ALLOW_INSECURE_BIND);
# put a TLS-terminating reverse proxy in front before exposing this publicly.
ENV LOOPRITE_HOME=/data \
    LOOPRITE_HOST=0.0.0.0 \
    LOOPRITE_PORT=8787 \
    LOOPRITE_ALLOW_INSECURE_BIND=1 \
    NODE_OPTIONS=--no-warnings=ExperimentalWarning

VOLUME ["/data"]
EXPOSE 8787

HEALTHCHECK --interval=30s --timeout=4s --start-period=5s \
  CMD wget -qO- http://127.0.0.1:8787/healthz >/dev/null 2>&1 || exit 1

ENTRYPOINT ["/app/install/docker-entrypoint.sh"]
