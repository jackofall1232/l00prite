# Policy Enforcement Point (PEP)

The enforcement point **outside** the request handler that would benefit from ignoring it —
CLI-OS's realization of l00prite's rule that *persisted flags are never authorization* and the
brief's requirement that safety-critical stops not be self-reported by the deciding process.

Enforces, over the atomic transactional store in `../state/`:
- **Cost caps** — in **dollars**, scoped by project/model/window. A handler *requests a spend
  reservation*; the PEP commits atomically or denies. Reconciled after with real usage
  (commit/refund). A crashed handler cannot leak past the cap — the reservation is the ceiling.
- **Retry caps** — hard attempt ceiling, honored across handler restarts.
- **Destructive-action gate** — per-action permission, never a blanket start-of-run grant.
- **Concurrency** — per-project session lease pool; per-repo memory write leases (atomic CAS).

Design: [`../../docs/architecture.md`](../../docs/architecture.md) §6 ·
[`../../docs/security-model.md`](../../docs/security-model.md).
