#!/bin/sh
# First-run bootstrap for the container: initialize the data dir/master key if absent, seed a
# zero-key mock provider so the endpoint + dashboard work immediately, then start the gateway.
# Operators add real provider keys and tokens with:  docker compose exec cli-os l00prite ...
set -e
: "${LOOPRITE_HOME:=/data}"
export LOOPRITE_HOME

if [ ! -f "$LOOPRITE_HOME/master.key" ]; then
  echo "[entrypoint] initializing $LOOPRITE_HOME"
  l00prite init
  l00prite provider add mock --adapter mock --default
  echo "[entrypoint] seeded 'mock' provider (demo). Add a real provider + token to go live."
fi

exec l00prite serve
