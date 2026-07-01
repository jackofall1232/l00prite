<!-- Example output from /build-loop, included for reference. Not part of l00prite's own build.
     The Run Ledger in Section 7 below shows a mid-project snapshot after several build
     sessions, for illustration. A fresh /build-loop run always writes that table empty
     (header row only) — rows are appended later by the target project's own build
     sessions, not by /build-loop itself. -->

## 1. Mission

wp-reading-time is a lightweight WordPress plugin that automatically calculates and
displays an estimated reading time ("5 min read") on blog posts. It's for WordPress site
owners and theme developers who want a simple, dependency-free reading-time indicator
without pulling in a bloated third-party plugin. Success looks like: install the plugin,
activate it, and reading times appear on posts automatically (with sane defaults), with an
optional settings page for site owners who want to tweak words-per-minute, label text, or
placement.

## 2. Architecture

- `wp-reading-time.php` — main plugin file: plugin header, bootstraps hooks, defines
  constants (version, plugin path/URL)
- `includes/class-reading-time-calculator.php` — pure calculation logic: takes post
  content, strips HTML/shortcodes, counts words, returns an estimated minutes value given a
  words-per-minute setting
- `includes/class-reading-time-display.php` — hooks into `the_content` (and exposes a
  `[reading_time]` shortcode + a `wp_reading_time()` template tag) to render the reading
  time string in the configured position (before/after content)
- `includes/class-reading-time-settings.php` — registers a settings page under
  Settings → Reading Time using the WordPress Settings API (words-per-minute, label text
  e.g. "{{minutes}} min read", display position, post types to apply to)
- `assets/css/reading-time.css` — minimal default styling for the reading-time badge,
  enqueued only on the front end
- `languages/` — `.pot` file for translation, following WordPress i18n conventions
  (text domain: `wp-reading-time`)
- `tests/` — PHPUnit tests using the WordPress test suite (`WP_UnitTestCase`), covering the
  calculator and the settings sanitization
- `wp-reading-time.pot`, `readme.txt` — WordPress.org plugin directory metadata (separate
  from this CLAUDE.md; `readme.txt` follows the WP.org readme format, not this protocol)
- No build step, no external services, no database tables beyond the standard WordPress
  options API (`wp_options`) for settings storage.

## 3. Requirements

- [ ] Plugin activates/deactivates cleanly on WordPress 6.0+ with PHP 7.4+ and no fatal
      errors or notices
- [ ] Reading time is calculated from post content word count divided by a configurable
      words-per-minute value (default: 200 wpm), rounded up to the nearest minute, minimum
      1 minute
- [ ] Reading time is automatically appended to post content via the `the_content` filter,
      on by default for the `post` post type
- [ ] A `[reading_time]` shortcode and a `wp_reading_time()` template tag are available for
      theme developers who want manual placement instead of the automatic filter
- [ ] Settings page at Settings → Reading Time lets the site owner configure:
      words-per-minute, label text (with a `{{minutes}}` placeholder), display position
      (before/after content), and which post types it applies to
- [ ] All settings are sanitized and escaped properly (`sanitize_text_field`,
      `absint`, output via `esc_html`) — no raw user input echoed
- [ ] Calculation logic strips HTML tags, shortcodes, and Gutenberg block comments before
      counting words, so the count reflects rendered text, not markup
- [ ] Plugin is translatable: all user-facing strings wrapped in `__()`/`_e()` with text
      domain `wp-reading-time`, and a `.pot` file is generated
- [ ] No PHP notices/warnings with `WP_DEBUG` enabled

## 4. Definition of Done

- [ ] Activating the plugin on a fresh WordPress install shows reading times on existing
      published posts with no manual configuration required
- [ ] Settings page saves and persists all four options correctly across page reloads
- [ ] Changing words-per-minute in settings visibly changes the displayed reading time on
      the front end
- [ ] `[reading_time]` shortcode renders correctly inside post/page content
- [ ] PHPUnit test suite passes for the calculator class (edge cases: empty content,
      content under 1 minute, content with HTML/shortcodes mixed in)
- [ ] No PHP notices, warnings, or deprecation messages with `WP_DEBUG` and
      `WP_DEBUG_LOG` enabled, checked via `debug.log` after exercising every feature
- [ ] `readme.txt` follows the WordPress.org plugin directory format and accurately
      describes the plugin

## 5. Agent Operating Loop

- **Generator role** — writes/modifies the calculator, display hooks, and settings page
  PHP classes one unit at a time (e.g., one PR-sized change: "add the calculator class and
  its tests" before moving to "add the settings page"), following WordPress coding
  standards (WPCS) and the existing file layout above.
- **Evaluator role** — runs PHPUnit after every generator change, checks the diff against
  the Requirements checklist in Section 3, verifies sanitization/escaping on any code that
  touches user input or renders output, and rejects changes that introduce PHP notices
  under `WP_DEBUG`.
- **Loop description** — generate one logical unit (calculator → display hooks → settings
  page → i18n/pot file → readme.txt) → run PHPUnit + manual WP_DEBUG check → evaluator signs
  off or sends back specific fix requests → move to the next unit only after the current
  one passes. No unit is started until the previous one is both built and tested.

## 6. Heartbeat Rules

- **Max iterations** — cap at 15 generator/evaluator round-trips for this plugin before
  stopping and checking in with a human; small tier, single-plugin scope should not need
  more than this to reach Definition of Done.
- **Human review gates** — human review required before: (1) the plugin is activated
  against any non-throwaway WordPress install, (2) the settings page schema changes after
  initial implementation, (3) declaring Definition of Done met.
- **Branch policy** — work on a feature branch (e.g. `build/wp-reading-time`); no direct
  commits to `main`; every generator unit lands as its own commit with a message describing
  what was built and what was tested; open a PR for human review once Definition of Done is
  met.

## 7. Run Ledger

| Session | Date | Built | Tested | Status |
|---------|------|-------|--------|--------|
| session-1 | 2026-06-30 | `includes/class-reading-time-calculator.php` + PHPUnit tests for word counting and HTML/shortcode stripping | `vendor/bin/phpunit --filter Calculator` — all passing | Done |
| session-2 | 2026-06-30 | `includes/class-reading-time-display.php` (the_content hook, shortcode, template tag) | Manual check on local WP install with WP_DEBUG on; verified output before/after content and via shortcode | Done |
| session-3 | 2026-06-30 | `includes/class-reading-time-settings.php` (Settings API page, sanitization) | Manual check: saved each setting, confirmed persistence and front-end effect; confirmed no unsanitized output | Done |
| session-4 | 2026-06-30 | `languages/wp-reading-time.pot`, `readme.txt` | Verified all user-facing strings wrapped in `__()`/`_e()`; readme.txt validated against WP.org readme format | In progress |

## 8. Completion Criteria

v1 is complete when:

- [ ] All items in Section 3 (Requirements) and Section 4 (Definition of Done) are checked
- [ ] PHPUnit suite is green with no skipped tests
- [ ] Plugin has been manually activated and exercised on a clean local WordPress install
      with `WP_DEBUG` on and produced zero notices/warnings
- [ ] `readme.txt` is ready for WordPress.org submission (accurate description, FAQ,
      changelog with a 1.0.0 entry)
- [ ] A human has reviewed the final PR and merged it to `main`
