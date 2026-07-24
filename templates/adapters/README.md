# Vendor Adapters

These files onboard specific AI coding agents into a l00prite project. In a scaffolded
project the real payload — `AGENTS.md`, `CLAUDE.md`, and the `.l00prite/` memory folder —
lives under `l00prite/` at the target repo root; the files in this directory are what
Planning Mode (`build-loop`) places at the tool-discovery paths so every agent finds it,
with the usual no-silent-overwrite rule. `templates/vendors.json` is the machine-readable
manifest of this mapping, consumed by `scripts/validate-l00prite.js`.

There are two kinds of file here:

- **Pointer files** — for tools whose discovery path is the repo root but which can open
  other files: a few lines routing the agent into `l00prite/`. They keep the target
  repo's root uncluttered.
- **Self-sufficient adapters** — for tools that hardcode a dot-folder path and may inject
  the file's text without being able to follow "go read X": these carry the six
  load-bearing protocol rules inline, never a bare pointer.

## Mapping

| Template file | Target location | Tool | Kind |
|---------------|-----------------|------|------|
| `pointer-AGENTS.md` | `AGENTS.md` (repo root) | AGENTS.md ecosystem (Codex, Cursor, Copilot, Windsurf, Zed, Jules, Factory, Amp, opencode, Devin, …) | Pointer → `l00prite/AGENTS.md` |
| `pointer-CLAUDE.md` | `CLAUDE.md` (repo root) | Claude Code | Pointer → `l00prite/CLAUDE.md` + `l00prite/AGENTS.md` |
| `GEMINI.md` | `GEMINI.md` (repo root) | Google Gemini CLI | Pointer — `@./l00prite/AGENTS.md` import |
| `QWEN.md` | `QWEN.md` (repo root) | Qwen Code | Pointer — `@./l00prite/AGENTS.md` import |
| `CONVENTIONS.md` | `CONVENTIONS.md` (repo root) | Aider | Pointer (loaded via `--read` / `read:` config) |
| `copilot-instructions.md` | `.github/copilot-instructions.md` | GitHub Copilot (all surfaces) | Self-sufficient |
| `l00prite.mdc` | `.cursor/rules/l00prite.mdc` | Cursor | Self-sufficient (`alwaysApply: true`) |
| `windsurf-l00prite.md` | `.windsurf/rules/l00prite.md` | Windsurf / Devin Desktop | Self-sufficient (`trigger: always_on`) |
| `GROK.md` | `.grok/GROK.md` | Grok CLI | Self-sufficient (hardcoded `.grok/GROK.md` path) |

Not adapter-shaped but part of the same universal layer: `templates/AGENTS.md.template`
(generates the real `l00prite/AGENTS.md`, the vendor-neutral operating guide) and
`templates/CLAUDE.md.template` (generates the real `l00prite/CLAUDE.md` blueprint; its
fixed protocol section is Claude's adapter).

## Inclusion rule

A file exists here only where (a) a tool hardcodes a root-level or dot-folder discovery
path (`GEMINI.md`, `QWEN.md`, `CONVENTIONS.md`, `.github/copilot-instructions.md`,
`.cursor/rules/`, `.windsurf/rules/`, `.grok/GROK.md`, root `AGENTS.md`/`CLAUDE.md`), or
(b) it adds a concrete named guarantee (Cursor `alwaysApply`, Windsurf `always_on`). Don't
add files beyond that — every always-on file costs context in tools that load several of
them.

## Design rules for adapter content

- **Self-sufficient where the tool requires it.** The dot-folder adapters
  (`copilot-instructions.md`, `l00prite.mdc`, `windsurf-l00prite.md`, `GROK.md`) carry the
  six load-bearing protocol rules inline. Some tools inject the file's text but cannot
  follow "go read X" (Copilot review surfaces), and Zed loads only its *first* match in a
  priority list where `.github/copilot-instructions.md` ranks **above** `AGENTS.md` — a
  bare pointer there would disconnect Zed from the protocol entirely.
- **Pointers stay thin.** The root-level pointer files never duplicate protocol rules —
  the whole point of the `l00prite/` folder is one authoritative copy. A pointer that
  grows rules becomes a fork.
- **Both-layouts wording in self-sufficient adapters.** Their paths are written relative
  to the *protocol root* — `l00prite/` in a scaffolded project, the repo root in the
  l00prite source repo — so the same bytes are correct in both places (the source repo
  dogfoods these adapters at its own root, byte-identically, validator-enforced).
- **Short.** Keep every adapter under ~5,000 characters. Windsurf documents hard limits
  (~6,000 per rules file, ~12,000 combined) and silently truncates beyond them; other tools
  simply pay context for every always-on byte.
- **Uniform.** The six numbered rules are identical across all self-sufficient adapters;
  only the title, frontmatter, and vendor-specific footnotes differ. If you change a rule,
  change it in every adapter (the validator's keyword checks will catch a miss).
- **Never ship loaded vendor config.** Files a tool *executes or auto-loads as
  configuration* (`.aider.conf.yml`, `.gemini/settings.json`, `.grok/settings.json`) are
  the user's, not the scaffold's — a repo-root config can silently override their personal
  settings. Document the snippet instead (see the `CONVENTIONS.md` footnote).

## Notes for specific tools

- **Gemini CLI / Qwen Code** support `@path` imports in their context files; subdirectory
  imports are documented in the `@./dir/file.md` form, which is why the pointers import
  `@./l00prite/AGENTS.md` (the bare `@l00prite/...` form collided with a path-duplication
  bug in older CLI builds). Only `.md` files can be imported. Users can also read the file
  directly with `{"context": {"fileName": ["GEMINI.md"]}}`-style settings in their own
  `.gemini/settings.json` / `.qwen/settings.json` — never shipped by l00prite.
- **Zed** reads the first match of: `.rules`, `.cursorrules`, `.windsurfrules`,
  `.clinerules`, `.github/copilot-instructions.md`, `AGENT.md`, `AGENTS.md`, `CLAUDE.md`,
  `GEMINI.md` — root only. l00prite ships nothing above `copilot-instructions.md`, and that
  file is self-sufficient, so Zed is covered.
- **Grok CLI** reads `.grok/GROK.md` for project rules (and `.grok/settings.json` for
  config, which l00prite never ships).
- **Nested `AGENTS.md` files** (monorepos): several tools apply only the closest file to
  the code being edited. If you add one, start it with a one-line pointer back to
  `l00prite/AGENTS.md` and `l00prite/.l00prite/`, or that subtree silently loses the
  protocol.

## Adding a new vendor

1. Confirm the tool's instruction-file path and format from its current official docs.
2. If it reads root `AGENTS.md` natively, stop — the pointer already covers it.
3. If its discovery file can follow links, copy a pointer file; if it hardcodes a
   dot-folder path or injects text verbatim, copy a self-sufficient adapter and keep the
   six rules byte-identical. Add an entry to `templates/vendors.json` (with
   `adapter_template`, `target_path`, `required_strings`, and `self_sufficient`).
4. Add the dogfood copy at this repo's own target location (self-sufficient adapters
   only — pointer files stay target-only because this source repo has no `l00prite/`
   folder), extend `scripts/validate-l00prite.js` expectations if needed, and run the
   validator.
