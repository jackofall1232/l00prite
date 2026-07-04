#!/usr/bin/env bash
# One-command install for a local (non-Docker) run. Builds the single static Go binary, initializes
# the data dir, and prints the next steps.
set -euo pipefail
cd "$(dirname "$0")/.."

if ! command -v go >/dev/null 2>&1; then
  echo "l00prite CLI-OS is built from Go source and needs the Go toolchain (>= 1.24)." >&2
  echo "Install Go from https://go.dev/dl and re-run, or use the Docker image (docker compose up)." >&2
  exit 1
fi

echo "Building the static l00prite binary (CGO disabled -> single static executable)…"
CGO_ENABLED=0 go build -ldflags='-s -w' -o ./l00prite ./cmd/l00prite

./l00prite init

cat <<'EOF'

Installed ./l00prite. Next steps:

  # 1) Add a provider key (or the zero-key demo upstream)
  ./l00prite provider add mock --adapter mock --default
  # real example:
  #   ./l00prite provider add anthropic --key sk-ant-... --default
  #   ./l00prite provider add openai    --key sk-...     --adapter openai-compat

  # 2) (optional) Register a repo so its .l00prite/ memory is injected
  ./l00prite repo register myrepo --root /path/to/repo --project default

  # 3) Mint a gateway token for your coding tool (shown once)
  ./l00prite token mint --project default --repo myrepo

  # 4) Start the server (endpoint + dashboard on http://127.0.0.1:8787)
  ./l00prite serve

  # 5) Point your tool at it, e.g. Codex/Aider/OpenAI SDK:
  #   OPENAI_BASE_URL=http://127.0.0.1:8787/v1
  #   OPENAI_API_KEY=<the l00prite token>

Optionally put the binary on your PATH:
  sudo install -m 0755 ./l00prite /usr/local/bin/l00prite
EOF
