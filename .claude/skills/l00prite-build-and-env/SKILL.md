---
name: l00prite-build-and-env
description: >
  Scope: l00prite repo development. Load this when you need to take a fresh clone of the
  l00prite repo (or cli-os specifically) from zero to a fully green local build/test state, or
  when something in that path is confusing: "go build fails with 'directory prefix . does not
  contain main module'", "npm test does nothing / ENOENT package.json", "go test ./... hangs or
  needs network", "how do I run scripts/dist.sh", "gofmt reports a file", "is this environment
  egress-blocked for Go modules", "where does Playwright live", "what Go/Node version do I
  need". Covers: prerequisites, the exact clone-to-green command sequence for the root Node
  tooling and the cli-os Go module, repo layout traps (no root go.mod, no package.json
  anywhere), scripts/dist.sh's 5-target release matrix, GOPROXY/module-cache and egress-blocked
  detection, the orphaned Node test suite (do not chase it), the Playwright browser preinstall
  with no committed harness, and current gofmt/goimports state. Does NOT cover interpreting
  validator/doctor *output* in depth, or the byte-parity edit procedure, or day-to-day config
  fields, or the Go runtime's internals — see the "When NOT to use this" table below.
---

# l00prite-build-and-env

**Scope: l00prite repo development.** This skill is for sessions building and testing the
`l00prite` repo itself (`/home/user/l00prite` in this environment, or wherever it is cloned to
for you). It is not for sessions working inside a project that merely *adopted* l00prite — a
target project has no `cli-os/`, no root validator, and none of the traps described here. If
you are in an adopted project, you want a portable skill instead (see the table below).

## What this skill is for

Getting a freshly cloned copy of this repo from "nothing has run yet" to "every check that can
pass, passes" — and knowing, ahead of time, the handful of places that command sequence breaks
in a way that looks like a real bug but is actually a known repo-layout quirk (no root
`go.mod`, no `package.json` anywhere, a Go build that silently goes dynamic if you forget one
flag, a Node test suite that has been dead since the Go port). It also covers the release
packaging script (`scripts/dist.sh`) and what "egress-blocked" looks like here, so you don't
waste a session chasing a network problem that isn't one (or missing one that is).

## When NOT to use this

| If you actually need... | Use this skill instead |
|---|---|
| What the validator's PASS/FAIL/stderr output *means*, its check categories, or the `scripts/check-parity.sh` / `scripts/verify-all.sh` / `scripts/sync-prompt-mirrors.sh` tooling | `l00prite-diagnostics-and-tooling` |
| A validator FAIL you can't explain, a `go test` failure you need to triage, or doctor WARN-vs-FAIL semantics | `l00prite-debugging-playbook` (Part B for repo-dev) |
| The byte-parity procedure for editing one of the six canonical loop prompts (edit → copy to 6 mirrors → validate) | `l00prite-change-control` |
| A deep map of Go packages, the gateway request flow, the engine run lifecycle, or "where do I add a new provider adapter / tool / run boundary" | `l00prite-cli-os-internals` |
| The full catalog of `cli-os` env vars, `config.json` fields, provider-manifest schema, or routing-profile config | `l00prite-config-and-flags` (Part B for repo-dev) |
| What counts as acceptable verification evidence, the golden PASS/test-count inventory, or how to add a regression test for a bot-review finding | `l00prite-validation-and-qa` (Part B for repo-dev) |
| Operating the *built* `l00prite` binary — CLI subcommands, the setup wizard, `/v1/*` endpoints, the dashboard | `l00prite-run-and-operate` (portable, for any project running the binary) |
| Bringing l00prite into a *different* project via `/build-loop` | `l00prite-adopting` (portable) |

---

## 1. Prerequisites

| Tool | Stated requirement | Verified installed here (2026-07-06) |
|---|---|---|
| Go | `cli-os/go.mod` declares `go 1.24` (no `toolchain` line, no patch pin); `cli-os/INSTALL.md` §1 says "Go 1.24 or newer" | `go1.24.7 linux/amd64` (`go version`) |
| Node | No `package.json`/`engines` field anywhere in the repo, so there is no project-declared minimum. The two root scripts (`scripts/validate-l00prite.js`, `scripts/l00prite-doctor.js`) use only CommonJS `require()` plus `fs`/`path` from the standard library — no `node:test`, no ESM, and a grep for `?.`/`??` found none, so they don't need a recent Node. **Unverified**: the exact minimum Node version they'd tolerate — treat "a reasonably current Node" as the working assumption. | `v22.22.2` (`node --version`) |
| git | needed to clone and for `dist.sh`'s version stamping (`git describe --tags --always --dirty`) | `2.43.0` (`git --version`) |
| A C toolchain | **not required** — see the CGO trap in §2 | `gcc`/`cc` happen to be present in this sandbox, which is itself the trap |

No `openssl`, no browser, and no cgo/C toolchain are required to build or test either the root
Node tooling or `cli-os`. (`cli-os/INSTALL.md` lists `openssl` and a browser only as optional,
for the *running* binary's setup wizard — not for building it.)

---

## 2. The exact clone-to-green sequence

Run these from the repo root unless a step says otherwise. Each was actually run to produce the
"observed" column; expect roughly the same on a similarly warm machine, but treat timings as
illustrative, not a contract.

| # | Command (cwd) | Observed result (2026-07-06) | Roughly how long |
|---|---|---|---|
| 1 | `node scripts/validate-l00prite.js` (root) | 519 lines, all `PASS `-prefixed, to **stdout**; 0 lines to stderr; exit 0 | ~0.05s |
| 2 | `node scripts/validate-l00prite.js 2>&1 \| grep FAIL` (root) | no output (there were 0 FAILs to find) | ~0.05s |
| 3 | `node scripts/l00prite-doctor.js .` (root) | `25 ok · 0 warn · 0 fail`, banner `HEALTHY — .l00prite/ memory is consistent and Execution Mode ships disarmed.`, exit 0 | ~0.05s |
| 4 | `cd cli-os && go build ./...` | exit 0, no output | <1s once the module cache is warm (see §5 for a cold cache) |
| 5 | `cd cli-os && go vet ./...` | exit 0, no output | <0.5s |
| 6 | `cd cli-os && go test -count=1 ./...` | all `ok` per package, 0 failures, exit 0 | ~5s fresh (uncached); `internal/engine` alone accounts for ~4.7s of that, everything else is sub-second |

Step 2 exists because **FAIL lines go to stderr, PASS lines go to stdout** — piping the bare
command through `grep FAIL` without `2>&1` will show you nothing even when there *are* failures.
Always redirect stderr first if you're filtering: `node scripts/validate-l00prite.js 2>&1 | ...`.

Package-by-package `go test -count=1 -v ./...` output currently shows **144 top-level `Test*`
functions** (`grep -rE '^func Test' --include='*_test.go' cli-os | wc -l` also returns 144) and
**170 `--- PASS` lines total once subtests are counted** (`t.Run` subtests appear in
`internal/server/{e2e_test.go,streaming_network_test.go}` and four files under
`internal/engine`). Both counts are volatile — they will grow as tests are added; 0 failures is
the contract, not the count.

### A build-correctness trap this session actually reproduced

A plain `go build ./cmd/l00prite` from `cli-os/`, run **without** `CGO_ENABLED=0`, on a machine
that happens to have a C toolchain (this sandbox does: `gcc`/`cc` are present, and `go env
CGO_ENABLED` defaults to `1` here) produces a **dynamically linked** binary — verified:

```
$ go build -o /tmp/x ./cmd/l00prite && file /tmp/x
/tmp/x: ELF 64-bit LSB executable, ... dynamically linked, interpreter /lib64/ld-linux-x86-64.so.2
$ ldd /tmp/x
        libc.so.6 => /lib/x86_64-linux-gnu/libc.so.6 (...)
```

The pure-Go SQLite driver (`modernc.org/sqlite`) itself needs no cgo, but Go's `net` package
will still link against libc's resolver via cgo when a C compiler is available and
`CGO_ENABLED` isn't pinned. The "single static binary" claim in `cli-os/README.md` and
`INSTALL.md` only holds when you build with `CGO_ENABLED=0` explicitly:

```
$ CGO_ENABLED=0 go build -o /tmp/x ./cmd/l00prite && file /tmp/x
/tmp/x: ELF 64-bit LSB executable, ... statically linked, stripped
$ ldd /tmp/x
        not a dynamic executable
```

`INSTALL.md` §2 and `scripts/dist.sh` both already set `CGO_ENABLED=0`; the trap is only for
anyone typing an ad hoc `go build` by hand while iterating.

---

## 3. Layout facts (read this before you go looking for the "normal" spot)

- **There is no root `go.mod`.** Go commands only work from inside `cli-os/`. Verified:
  ```
  $ go build ./...            # run from repo root
  pattern ./...: directory prefix . does not contain main module or its selected dependencies
  ```
  `cli-os/go.mod` is the only Go module in the repo (`module
  github.com/jackofall1232/l00prite/cli-os`). Always `cd cli-os` first for any `go` command.
- **There is no `package.json` anywhere in the repo** — not at root, not in `cli-os/` (confirmed
  with `find /home/user/l00prite -iname "package*.json"`, zero results). So `npm test` (or
  `npm` anything) fails immediately, from either directory:
  ```
  $ npm test
  npm error code ENOENT
  npm error path .../package.json
  ```
  (exit code `254` in both cases, tested at repo root and inside `cli-os/`.) This means the
  `node scripts/*.js` entry points are the *only* Node-side automation — there is no npm script
  layer over them, and none is expected.
- **`cli-os/test/*.test.js` (`bridge.test.js`, `e2e.test.js`, `routing-auto.test.js`,
  `unit.test.js`) is an orphaned Node test suite from before the Go port.** It imports from
  `../src/config.js`, `../src/security/vault.js`, etc. — a `src/` tree that no longer exists
  (`ls cli-os/src` → "No such file or directory"). Running any one of them fails on the very
  first `import`, not on an assertion:
  ```
  $ node --test cli-os/test/unit.test.js
  not ok 1 - vault: encrypt/decrypt roundtrip, ...
    error: "Cannot find module '.../cli-os/src/config.js' imported from .../unit.test.js"
  ```
  **Do not chase this.** It is dead weight left over from the Node→Go rewrite, not a regression
  to fix — the Go test suite in `cli-os/internal/**` is the live equivalent (see §2). If you're
  deciding whether to delete it outright, that's a repo-hygiene call for the maintainer /
  `l00prite-change-control`, not something this skill tells you to do unasked.
- **The root `.gitignore` is generic Node/JS boilerplate** (npm/yarn/pnpm caches, `.next`,
  `.nuxt`, a bare `dist` line, etc. — copied from a standard Node template, not written for this
  repo's actual shape). The real, purpose-written Go ignores live in `cli-os/.gitignore`:
  build artifacts (`/l00prite`, `/cli-os`, `*.test`) and runtime data (`.env`, `*.db`,
  `*.db-wal`/`-shm`, `master.key`, `ledger.jsonl`, `/data/`, `.cli-os-data/`). One side effect
  worth knowing: the root `.gitignore`'s bare `dist` line also matches `cli-os/dist/` (verified
  with `git check-ignore -v cli-os/dist` → matches `.gitignore:83:dist`), which is exactly the
  directory `scripts/dist.sh` writes to (§4) — so release artifacts never need a separate ignore
  rule, but it's the generic Node rule doing it, not a `cli-os`-specific one.

---

## 4. `scripts/dist.sh` — the cross-platform release matrix

Read from the script (`cli-os/scripts/dist.sh`), not paraphrased:

- Must be run from inside (or under) `cli-os/` — it does `cd "$(dirname "$0")/.."` itself, so
  `bash scripts/dist.sh` from `cli-os/` is the normal invocation; `VERSION` defaults to `git
  describe --tags --always --dirty`, or falls back to `dev`.
- The five targets, verbatim from the `TARGETS` array: `linux/amd64`, `linux/arm64`,
  `darwin/amd64`, `darwin/arm64`, `windows/amd64`. Each is built with `CGO_ENABLED=0 GOOS=...
  GOARCH=... go build -trimpath -ldflags "$LDFLAGS" -o ... ./cmd/l00prite`.
- `LDFLAGS` is `-s -w -X
  'github.com/jackofall1232/l00prite/cli-os/internal/gateway.Version=$VERSION'` — strips debug
  info and stamps the single source of truth for `healthz` + dashboard version display. Verified
  the stamping mechanism works with a throwaway single-target build (output went to a scratch
  path outside the repo, not `cli-os/dist/`):
  ```
  $ CGO_ENABLED=0 go build -ldflags "-s -w -X '...gateway.Version=vtest-skill-verify'" -o /tmp/x ./cmd/l00prite
  $ /tmp/x version
  l00prite vtest-skill-verify (linux/amd64)
  ```
- Each non-Windows target is archived as `l00prite_${VERSION}_${os}_${arch}.tar.gz`. Windows is
  zipped the same way (`l00prite_${VERSION}_windows_amd64.zip`) **if `zip` is on `PATH`**
  (verified present here: `/usr/bin/zip`); otherwise the script ships the raw `.exe` plus a
  `.tar.gz` fallback and prints a note. `INSTALL.md`/`README.md` are copied alongside the binary
  into every archive.
- Checksums: `sha256sum` if present, else `shasum -a 256` (both are present here) — written to
  `$DIST/SHA256SUMS` after all targets build.
- Output lands in `cli-os/dist/`, which the script `rm -rf`s **at the start** of each run (so
  it's always a clean rebuild) but does **not** delete at the end — the artifacts are left in
  place for you to inspect/ship. `cli-os/dist/` is git-ignored (via the root `.gitignore`'s
  generic `dist` rule, §3), but it is still a real directory on disk until you clean it up
  yourself if you don't want it lying around.
- Cross-compiling to the four non-native targets needs **no extra network fetch** beyond
  whatever populated the module cache for the native build — verified in this session by
  building all four remaining targets with `GOPROXY=off` (fully offline) against a module cache
  that had only been warmed by an earlier `go mod download all`:
  ```
  $ GOPROXY=off CGO_ENABLED=0 GOOS=windows GOARCH=amd64 go build -o /tmp/x ./cmd/l00prite   # exit 0
  $ GOPROXY=off CGO_ENABLED=0 GOOS=darwin  GOARCH=arm64 go build -o /tmp/x ./cmd/l00prite   # exit 0
  $ GOPROXY=off CGO_ENABLED=0 GOOS=darwin  GOARCH=amd64 go build -o /tmp/x ./cmd/l00prite   # exit 0
  $ GOPROXY=off CGO_ENABLED=0 GOOS=linux   GOARCH=arm64 go build -o /tmp/x ./cmd/l00prite   # exit 0
  ```
  This is because `go mod download all` resolves the full module graph "for all relevant
  combinations of GOOS/GOARCH" (Go's own semantics for the `all` pattern since module-graph
  pruning), and this repo's whole dependency graph (`modernc.org/sqlite` and its indirect
  deps — 19 modules total, all pure Go, no per-platform native artifacts) is small enough that
  one `go mod download all` (or even one native `go build ./...`, which pulls the same graph)
  is enough to make the entire 5-target `dist.sh` matrix buildable **fully offline**.
  I did not find independent evidence in this repo for a claim that darwin/arm64 specifically
  needs its own separate module fetch — if you've seen that happen, it was likely a cache that
  hadn't been warmed by a full-graph `go mod download`/`go build ./...` yet, not a
  platform-specific fetch requirement.
- This session did not run `bash scripts/dist.sh` itself end-to-end (it writes into
  `cli-os/dist/`, outside this skill's own directory, so it was left to the equivalent
  single/multi-target manual builds above instead). The script's own real, full run **is**
  on record in `.l00prite/ledger.md` (2026-07-05 entry, "OS-APK" pass): `bash scripts/dist.sh
  vtest` → exit 0 → "5 static artifacts (linux/darwin amd64+arm64, windows/amd64,
  ~4.4-4.9MB) + SHA256SUMS; dist/ removed after" — that "removed after" was a manual cleanup by
  that session, not something the script does for you (see the point above).

---

## 5. Module cache, `GOPROXY`, and detecting an egress-blocked environment

- `go env GOPROXY` here is the Go default: `https://proxy.golang.org,direct`. Nothing in
  `cli-os/go.mod`/`go.sum` or this repo overrides it.
- This sandbox's outbound HTTPS normally goes through a local policy-enforcing proxy
  (`$HTTPS_PROXY`), **but `proxy.golang.org` is explicitly listed in `$no_proxy`** (verified via
  `env | grep -i proxy` and `curl $HTTPS_PROXY/__agentproxy/status`), so `go` module fetches
  bypass that proxy and go straight out. This is a fact about *this specific sandbox's* egress
  configuration, dated 2026-07-06 — a different environment (a laptop, a CI runner, a locked-down
  corporate network) may route or block this differently; don't assume it.
- Live fetch verified: a `go mod download all` from `cli-os/`, pointed at a completely empty,
  isolated `GOMODCACHE` (so nothing could be served from cache), fetched all 19 module zips
  successfully in well under 10 seconds:
  ```
  $ GOMODCACHE=/tmp/empty GOPROXY=https://proxy.golang.org,direct GOFLAGS=-mod=mod \
      go mod download -x all
  # get https://proxy.golang.org/.../@v/....zip: 200 OK (0.0Ns)   [x19]
  ```
  (`go mod download` only reads `go.mod`/`go.sum`, it never writes them, so this is safe to run
  against the real `cli-os/go.mod` — just point `GOMODCACHE` somewhere scratch if you want to
  force a true cold-cache test rather than reusing the ambient cache.)
- **What an egress-blocked environment looked like historically, for this exact project** (both
  points below are project-recorded, dated by their source docs, and both source docs are
  themselves flagged stale elsewhere — the runtime described is Go today, not Node; treat this
  as history, not current state):
  - `cli-os/docs/open-questions.md` "Q3" records that an *earlier* session's environment
    "blocks module fetch + live-provider egress, so Go couldn't be built or tested" there, and
    that session chose Node for `cli-os` v1 specifically because of that constraint.
  - `cli-os/docs/node-to-go-port-notes.md` records that a *later* session (the one that actually
    did the Node→Go port) checked first: `go get` worked live because `proxy.golang.org` was
    allow-listed, while direct HTTPS to some provider docs domains was mixed (Anthropic's
    reachable, OpenAI's/z.ai's returned 403) — and its stated rule was "Go module fetch is what
    gates the port... and it works, so the port proceeded." In other words: check module-proxy
    reachability specifically, not provider-domain reachability, when deciding whether a Go
    build is even possible in a given sandbox.
  - How to detect it yourself, today, in under 10 seconds and without touching the real module
    cache: run the `go mod download all` command above with a scratch `GOMODCACHE`. A fast
    stream of `200 OK` lines means module egress is open (as verified here); a hang, a
    connection-refused, or a `403`/`407` from the fetch means it's blocked — in the latter case,
    stop and report the blocked host rather than retrying (per this environment's own proxy
    guidance at `/root/.ccr/README.md`, if you're in a Claude Code Remote sandbox; the general
    principle — don't silently route around an egress denial — applies regardless of sandbox).

---

## 6. Playwright: browser is preinstalled, harness is not

- A Chromium build is preinstalled at `/opt/pw-browsers` in this environment
  (`chromium-1194`, `chromium_headless_shell-1194`, `ffmpeg-1011`, plus a `chromium` symlink),
  and `$PLAYWRIGHT_BROWSERS_PATH` already points there. `npx` is available (`v10.9.7`).
- **There is no committed Playwright harness anywhere in this repo** — verified with `find
  /home/user/l00prite -iname "uitest*"` (zero results), a search for `*.spec.ts` /
  `playwright.config*` (zero results), and a grep for the word "playwright" across every
  Markdown file in the repo (zero results). The ledger's "18/18" Playwright claims for a past
  dashboard/setup pass are **not reproducible from the repo** — see
  `l00prite-failure-archaeology` for that story.
- Since there is no `package.json` anywhere (§3), using Playwright here means bringing your own
  `package.json` + `npm install playwright` (or `@playwright/test`) first — that step needs
  registry egress (`registry.npmjs.org` is in this sandbox's `$no_proxy` allow-list alongside
  `proxy.golang.org`, per the same status check in §5, but this session did not exercise an
  actual `npm install` of Playwright, so treat "it'll work" as **unverified**, not confirmed).
  Building that harness for real is the `l00prite-runs-view-campaign` skill's job, not this
  one's.

---

## 7. Formatting state

- `cd cli-os && gofmt -l .` reports exactly one file with formatting drift, as of 2026-07-06:
  `internal/gateway/adapters/adapters_test.go`. This is known, current drift — not something
  this skill fixes for you, just something to expect and not be surprised by if you're doing a
  clean-tree check before other work. `gofmt` doesn't care about the module root, so `gofmt -l
  cli-os/` from the repo root reports the same file (verified) even though `go build`/`go
  vet`/`go test` insist on running from inside `cli-os/`.
- `goimports` is **not installed** in this environment (`which goimports` → exit 1, no output).
  There is no CI workflow in this repo's own `.github/` (it only contains
  `copilot-instructions.md`; the `ci.yml`/`integration.yml` files that do exist under
  `templates/skeleton/{large,medium}/.github/workflows/` are scaffold *templates* for projects
  l00prite generates, not this repo's own pipeline) and no pre-commit hook enforcing `gofmt` or
  `goimports` — so formatting drift is caught only when someone runs `gofmt -l` by hand or a PR
  reviewer flags it, never automatically.

---

## Provenance and maintenance

Every volatile fact above, with a one-line command to re-check it yourself:

| Fact | Re-verification command |
|---|---|
| Validator: 519 PASS / 0 FAIL, exit 0 | `node scripts/validate-l00prite.js >/tmp/v.out 2>/tmp/v.err; echo "exit=$?"; wc -l /tmp/v.out /tmp/v.err` (PASS count = lines in `v.out`, FAIL count = lines in `v.err` — FAIL goes to stderr, not stdout) |
| Doctor: 25 ok / 0 warn / 0 fail, HEALTHY | `node scripts/l00prite-doctor.js .` |
| Go version / toolchain | `go version` (compare against `go 1.24` in `cli-os/go.mod`) |
| Node version | `node --version` |
| No root `go.mod` | `go build ./... ` from repo root → expect the "directory prefix . does not contain main module" error |
| No `package.json` anywhere | `find /home/user/l00prite -iname "package*.json"` → expect no output |
| `npm test` is dead | `npm test` from repo root or from `cli-os/` → expect `ENOENT ... package.json` |
| Orphaned Node suite fails on import, not assertion | `node --test cli-os/test/unit.test.js` → expect `ERR_MODULE_NOT_FOUND` for `src/config.js` |
| `go test` count (144 top-level / 170 incl. subtests) | `cd cli-os && grep -rE '^func Test' --include='*_test.go' . \| wc -l; go test -count=1 -v ./... 2>&1 \| grep -c -- '--- PASS'` |
| CGO-default trap reproduces here | `cd cli-os && go build -o /tmp/x ./cmd/l00prite && ldd /tmp/x` (expect dynamically linked) vs. `CGO_ENABLED=0 go build -o /tmp/x ./cmd/l00prite && ldd /tmp/x` (expect "not a dynamic executable") |
| `dist.sh`'s 5 targets, ldflags, checksum tool | read `cli-os/scripts/dist.sh` directly — it's short and this section quotes it verbatim |
| `cli-os/dist` is git-ignored via the root's generic rule | `git check-ignore -v cli-os/dist` |
| `gofmt` drift file | `cd cli-os && gofmt -l .` |
| `goimports` absent | `which goimports; echo exit=$?` (expect exit 1) |
| GOPROXY default / no_proxy allow-list for proxy.golang.org | `go env GOPROXY`; `curl -sS "$HTTPS_PROXY/__agentproxy/status"` (sandbox-specific; irrelevant outside a Claude Code Remote sandbox) |
| Playwright browser path exists, no harness committed | `ls /opt/pw-browsers`; `find /home/user/l00prite -iname "uitest*"` (expect no output) |
| No CI workflow in this repo's own `.github/` | `ls /home/user/l00prite/.github/` (expect only `copilot-instructions.md`) |
| Current branch / HEAD (context only, expect drift) | `git rev-parse --abbrev-ref HEAD && git rev-parse --short HEAD` — was `claude/beautiful-gauss-bxlzbs` at `d4c6518` on 2026-07-06 |
