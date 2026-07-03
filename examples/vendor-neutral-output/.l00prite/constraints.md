# Constraints

Hard rules, user preferences, security boundaries, and architecture constraints.

## Hard Rules
- Scaffolding generates files only; it does not execute implementation.
- Existing files must not be silently overwritten.
- Every implementation loop must update `.l00prite/` memory before stopping.

## User Preferences
- Python 3.11+, standard library plus `feedparser` only.
- Plain-text output; no color codes.

## Security Boundaries
- No credentials of any kind — feeds are public URLs.
- Network access is limited to HTTP(S) GETs against URLs listed in `feeds.txt`.

## Architecture Constraints
- Single-file CLI (`src/main.py`); resist adding modules until a requirement forces it.
- Tests use pytest with default discovery (`tests/test_*.py`).
