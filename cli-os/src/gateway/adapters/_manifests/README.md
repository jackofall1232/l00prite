# Provider manifests

Machine-readable, per-provider static facts that drive the adapters — the "data" half of the
"adapters are data + code" design (mirroring l00prite's `templates/vendors.json`). The
translation logic is code (`../<provider>/`); everything here is declarative so adding or
retuning a provider is a data edit, not a code change.

These example manifests are populated from the **verified** research pass (see
[`../../../../docs/provider-adapters.md`](../../../../docs/provider-adapters.md)). They exist
now to **validate the adapter approach concretely** before implementation — they are not yet
consumed by runtime code.

## Fields

| Field | Meaning |
|---|---|
| `provider` / `display_name` | machine key / human label |
| `adapter` | `native-messages` (full translator) or `openai-compat` (thin shim) |
| `base_url`, `endpoints`, `auth` | how to reach it |
| `streaming` | wire format the stream translator must handle |
| `tool_schema` | tool-calling shape (`openai-function`, `openai-function-flat`, `anthropic-input-schema`) |
| `verification` | provenance + confidence for shape and pricing (honesty about egress limits) |
| `models[]` | id, context, max_output, capabilities, price map (with per-model `price_confidence`) |

`price_confidence: "unconfirmed"` means the number is third-party and MUST be confirmed against
a first-party pricing page before the cost meter treats it as authoritative (Open Question Q7).
`price_per_mtok` carries **separate** input / output / cache-write / cache-read rates because
provider prompt-cache tokens are billed differently and the meter must not conflate them.
