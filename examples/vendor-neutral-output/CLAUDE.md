# Example Target Project CLAUDE.md

This is an example generated agent guidance file for a target project. It points Claude to `.l00prite/` as the shared source of truth and preserves the l00prite non-execution boundary during scaffolding.

## Mission

Build the target project described in `.l00prite/blueprint.md`.

## Operating Rule

Before each implementation loop, read `.l00prite/` memory. After each loop, update the ledger, state, todos, failures if needed, and heartbeat before stopping.
