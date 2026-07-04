#!/usr/bin/env bash
# One-command install for a local (non-Docker) run. Zero npm dependencies — this just checks the
# Node version, initializes the data dir, and prints the next steps.
set -euo pipefail
cd "$(dirname "$0")/.."

need_major=22
have=$(node -p "process.versions.node.split('.')[0]" 2>/dev/null || echo 0)
if [ "$have" -lt "$need_major" ]; then
  echo "l00prite CLI-OS needs Node >= ${need_major}.5 (found: $(node -v 2>/dev/null || echo none))." >&2
  echo "Install Node 22+ from https://nodejs.org and re-run." >&2
  exit 1
fi

node bin/cli.js init

cat <<'EOF'

Installed. Next steps:

  # 1) Add a provider key (or the zero-key demo upstream)
  node bin/cli.js provider add mock --adapter mock --default
  # real example:
  #   node bin/cli.js provider add anthropic --key sk-ant-... --default
  #   node bin/cli.js provider add openai   --key sk-...     --adapter openai-compat

  # 2) (optional) Register a repo so its .l00prite/ memory is injected
  node bin/cli.js repo register myrepo --root /path/to/repo --project default

  # 3) Mint a gateway token for your coding tool (shown once)
  node bin/cli.js token mint --project default --repo myrepo

  # 4) Start the server (endpoint + dashboard on http://127.0.0.1:8787)
  node bin/cli.js serve

  # 5) Point your tool at it, e.g. Codex/Aider/OpenAI SDK:
  #   OPENAI_BASE_URL=http://127.0.0.1:8787/v1
  #   OPENAI_API_KEY=<the l00prite token>

Optionally symlink the CLI onto your PATH:
  ln -s "$(pwd)/bin/cli.js" /usr/local/bin/l00prite
EOF
