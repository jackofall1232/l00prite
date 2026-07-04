// Shared untrusted-content envelope. Anything re-fed into a model prompt that did not come from
// config or the authenticated request — repository memory (inject.js) and the output of a
// delegated provider during bridging (bridge.js) — is UNTRUSTED and must be wrapped here.
//
// Two jobs:
//   1. A non-instruction preamble so the model treats the wrapped block as reference data, never
//      as instructions/role-changes (prompt-injection guard, per architecture.md §6.4).
//   2. Tag-breakout neutralization: a malicious untrusted body that contains the literal closing
//      delimiter of its own wrapper (e.g. "</memory>" inside memory content, or
//      "</delegated_response>" inside a delegated answer) would otherwise "escape" the envelope
//      and have its trailing text read as trusted. We defuse the *complete* closing token by
//      entity-escaping it, so the only real closing tag is the one WE emit.

// Escape the complete closing token `</tag ...>` for each protected tag, case-insensitively and
// tolerant of internal whitespace. Only complete closers are a breakout vector; a bare `</tag`
// without a `>` cannot close anything, and other angle brackets (e.g. code in memory) are left
// intact so content fidelity is preserved.
export function neutralizeClosers(text, tagNames) {
  let out = String(text ?? '');
  for (const t of tagNames) {
    const re = new RegExp(`</\\s*${t}\\s*>`, 'gi');
    out = out.replace(re, `&lt;/${t}&gt;`);
  }
  return out;
}

// Attribute values are untrusted too (e.g. a delegated response's `model` can echo an
// attacker-influenced pinned model id). Fully entity-escape them so a value can never carry a live
// `></tag>` that would close the wrapper's own opening tag early. Escape `&` first.
function escapeAttr(v) {
  return String(v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function attrString(attrs) {
  return Object.entries(attrs)
    .filter(([, v]) => v != null)
    .map(([k, v]) => ` ${k}="${escapeAttr(v)}"`)
    .join('');
}

// Wrap a single untrusted body in one tag with a preamble. `protect` lists tag names whose
// closers must be neutralized inside the body (defaults to [tag]).
export function wrapUntrusted({ preamble, tag, attrs = {}, body, protect }) {
  const safe = neutralizeClosers(body, protect || [tag]);
  return `${preamble}\n\n<${tag}${attrString(attrs)}>\n${safe}\n</${tag}>`;
}

// Build one inner block string `<tag ...>...</tag>` with its closer neutralized. Used to compose
// several blocks inside a single outer container (memory injection).
export function untrustedBlock({ tag, attrs = {}, body, protect }) {
  const safe = neutralizeClosers(body, protect || [tag]);
  return `<${tag}${attrString(attrs)}>\n${safe}\n</${tag}>`;
}
