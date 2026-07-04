// runTurn — the single internal "one completion" primitive: route -> (memory) -> reserve -> call ->
// meter -> commit -> ledger, with NO HTTP concerns. Both the ingress non-streaming path and the
// bridge loop call this, so a delegated hop reuses the exact same money/ledger machinery as a
// top-level request. Ported from turn.js.
package gateway

import (
	"context"
	"database/sql"
	"time"

	"github.com/jackofall1232/l00prite/cli-os/internal/config"
	"github.com/jackofall1232/l00prite/cli-os/internal/gateway/adapters"
	"github.com/jackofall1232/l00prite/cli-os/internal/ledger"
	"github.com/jackofall1232/l00prite/cli-os/internal/memory"
	"github.com/jackofall1232/l00prite/cli-os/internal/oai"
	pep "github.com/jackofall1232/l00prite/cli-os/internal/policy"
	"github.com/jackofall1232/l00prite/cli-os/internal/security"
	"github.com/jackofall1232/l00prite/cli-os/internal/state"
)

// App is the per-server context (db + config + aliases) threaded through the request path.
type App struct {
	DB      *sql.DB
	Cfg     config.Config
	Aliases map[string]string
	// StartedAt is the process boot time, set by server.Start, and reported as real uptime by the
	// dashboard. A zero value (e.g. an App built directly in a test) is reported as "unknown", never
	// as a fabricated availability figure.
	StartedAt time.Time
}

// ProviderRow is a full providers-table row.
type ProviderRow struct {
	Name      string
	Adapter   string
	BaseURL   string
	EncKey    string
	Enabled   bool
	IsDefault bool
}

// Denial is a reservation denial surfaced to the caller.
type Denial struct {
	Status int
	Reason string
	Code   string
	Cap    float64
	Spent  float64
}

// TurnResult is the runTurn outcome.
type TurnResult struct {
	OK        bool
	Response  map[string]any
	Usage     oai.Usage
	Cost      Cost
	Route     RouteResult
	MemStatus string
	Denial    *Denial
}

// TurnOpts are the inputs to runTurn.
type TurnOpts struct {
	Project      string
	RepoID       string
	RepoRoot     string
	OpenaiReq    map[string]any
	RouteHeader  string
	ClientCtx    context.Context
	RequestID    string
	Paths        []string
	Depth        int
	InjectMemory bool
	Meta         map[string]any
}

// ListProviders returns the provider rows (default first, then name).
func ListProviders(db *sql.DB) []ProviderRow {
	rows, err := db.QueryContext(state.Ctx(),
		`SELECT name, adapter, base_url, enc_key, enabled, is_default FROM providers ORDER BY is_default DESC, name`)
	if err != nil {
		return nil
	}
	defer rows.Close()
	var out []ProviderRow
	for rows.Next() {
		var (
			p               sql.NullString
			baseURL, encKey sql.NullString
			name, adapter   string
			enabled, isDef  int
		)
		if err := rows.Scan(&name, &adapter, &baseURL, &encKey, &enabled, &isDef); err != nil {
			continue
		}
		_ = p
		out = append(out, ProviderRow{
			Name: name, Adapter: adapter, BaseURL: baseURL.String, EncKey: encKey.String,
			Enabled: enabled != 0, IsDefault: isDef != 0,
		})
	}
	return out
}

func providerInfos(rows []ProviderRow) []ProviderInfo {
	out := make([]ProviderInfo, len(rows))
	for i, r := range rows {
		out[i] = ProviderInfo{Name: r.Name, Enabled: r.Enabled, IsDefault: r.IsDefault}
	}
	return out
}

func getProvider(db *sql.DB, name string) *ProviderRow {
	var (
		adapter         string
		baseURL, encKey sql.NullString
		enabled, isDef  int
	)
	err := db.QueryRowContext(state.Ctx(),
		`SELECT adapter, base_url, enc_key, enabled, is_default FROM providers WHERE name = ?`, name).
		Scan(&adapter, &baseURL, &encKey, &enabled, &isDef)
	if err != nil {
		return nil
	}
	return &ProviderRow{Name: name, Adapter: adapter, BaseURL: baseURL.String, EncKey: encKey.String, Enabled: enabled != 0, IsDefault: isDef != 0}
}

const intentCap = 2000

func userIntent(content any) string {
	if s, ok := content.(string); ok {
		return truncStr(s, intentCap)
	}
	if arr := asArr(content); arr != nil {
		var parts []string
		for _, pp := range arr {
			p := asMap(pp)
			switch asStr(p["type"]) {
			case "text":
				if t := asStr(p["text"]); t != "" {
					parts = append(parts, t)
				}
			case "image_url":
				parts = append(parts, "[image]")
			}
		}
		joined := joinNonEmpty(parts, " ")
		return truncStr(joined, intentCap)
	}
	return ""
}

func joinNonEmpty(parts []string, sep string) string {
	out := ""
	for _, p := range parts {
		if p == "" {
			continue
		}
		if out != "" {
			out += sep
		}
		out += p
	}
	return out
}

// DigestFrom builds the minimal safe projection for the memory layer (never the raw prompt).
func DigestFrom(req map[string]any, paths []string) memory.Digest {
	messages := asArr(req["messages"])
	var lastUserContent any
	for i := len(messages) - 1; i >= 0; i-- {
		m := asMap(messages[i])
		if m != nil && asStr(m["role"]) == "user" {
			lastUserContent = m["content"]
			break
		}
	}
	var toolNames []string
	for _, mm := range messages {
		m := asMap(mm)
		for _, tcRaw := range asArr(m["tool_calls"]) {
			if n := asStr(asMap(asMap(tcRaw)["function"])["name"]); n != "" {
				toolNames = append(toolNames, n)
			}
		}
	}
	return memory.Digest{UserIntent: userIntent(lastUserContent), ReferencedPaths: paths, RecentToolCalls: toolNames}
}

func mergeDecision(base map[string]any, depth int, meta map[string]any) map[string]any {
	d := copyMap(base)
	d["depth"] = depth
	for k, v := range meta {
		d[k] = v
	}
	return d
}

func runTurn(app *App, opts TurnOpts) (TurnResult, error) {
	db, cfg := app.DB, app.Cfg
	aliases := app.Aliases
	if aliases == nil {
		aliases = cfg.Aliases
	}

	route, err := Pick(providerInfos(ListProviders(db)), aliases, opts.OpenaiReq, opts.RouteHeader, cfg)
	if err != nil {
		return TurnResult{}, err
	}
	provRow := getProvider(db, route.Provider)
	if provRow == nil {
		return TurnResult{}, HTTPError(500, `Routed provider "`+route.Provider+`" is not registered`, "configuration_error")
	}
	adapter := adapters.AdapterFor(provRow.Adapter)

	apiKey := ""
	if !adapter.Direct() {
		if provRow.BaseURL == "" {
			return TurnResult{}, HTTPError(500, `Provider "`+route.Provider+`" has no base URL configured`, "configuration_error")
		}
		if provRow.EncKey == "" {
			return TurnResult{}, HTTPError(500, `Provider "`+route.Provider+`" has no API key configured`, "configuration_error")
		}
		k, derr := security.DecryptSecret(cfg.MasterKeyPath, provRow.EncKey)
		if derr != nil {
			return TurnResult{}, HTTPError(500, "Failed to decrypt provider key", "configuration_error")
		}
		apiKey = k
	}

	// Memory injection is a top-level (depth 0) concern; delegated sub-calls run without repo memory.
	var mem memory.Context
	if opts.InjectMemory && opts.RepoRoot != "" {
		mem = memory.Query(opts.RepoRoot, DigestFrom(opts.OpenaiReq, opts.Paths), cfg.Memory.ContextTokens, cfg.Memory.MaxFileBytes, false)
	} else if opts.InjectMemory {
		mem = memory.Context{Status: "empty"}
	} else {
		mem = memory.Context{Status: "skipped"}
	}

	maxOut := numToInt(opts.OpenaiReq["max_tokens"])
	if maxOut == 0 {
		maxOut = numToInt(opts.OpenaiReq["max_completion_tokens"])
	}
	if maxOut == 0 {
		maxOut = cfg.DefaultMaxTokens
	}
	// Never forward client transport flags on this non-streaming primitive.
	cleanReq := copyMap(opts.OpenaiReq)
	delete(cleanReq, "stream")
	delete(cleanReq, "stream_options")
	finalReq := InjectMemory(cleanReq, mem)
	finalReq["max_tokens"] = maxOut

	ceiling := ReservationCeiling(route.Provider, route.Model, finalReq)
	resv := pep.Reserve(db, opts.Project, ceiling, cfg.DefaultDailyCapUsd)
	decision := mergeDecision(route.Decision, opts.Depth, opts.Meta)
	ruleID := asStr(route.Decision["rule_id"])

	if !resv.OK {
		ledger.Append(db, cfg.LedgerPath, ledger.Entry{
			RequestID: opts.RequestID, Project: opts.Project, Repo: opts.RepoID,
			Provider: route.Provider, Model: route.Model, RuleID: ruleID, Decision: decision,
			MemoryStatus: mem.Status, Outcome: "denied_" + resv.Reason,
		})
		return TurnResult{OK: false, Denial: &Denial{Status: 402, Reason: resv.Reason, Code: resv.Reason, Cap: resv.Cap, Spent: resv.Spent}}, nil
	}

	result, cerr := callNonStream(adapter, *provRow, route.Model, finalReq, apiKey, cfg, opts.ClientCtx)
	if cerr != nil {
		MarkFailure(route.Provider)
		pep.Refund(db, resv.ReservationID)
		ledger.Append(db, cfg.LedgerPath, ledger.Entry{
			RequestID: opts.RequestID, Project: opts.Project, Repo: opts.RepoID,
			Provider: route.Provider, Model: route.Model, RuleID: ruleID, Decision: decision,
			MemoryStatus: mem.Status, Outcome: "error",
		})
		return TurnResult{}, cerr
	}

	cost := CostOf(route.Provider, route.Model, result.Usage)
	pep.Commit(db, resv.ReservationID, cost.USD)
	MarkSuccess(route.Provider)
	usage := result.Usage
	ledger.Append(db, cfg.LedgerPath, ledger.Entry{
		RequestID: opts.RequestID, Project: opts.Project, Repo: opts.RepoID,
		Provider: route.Provider, Model: route.Model, RuleID: ruleID, Decision: decision,
		Usage: &usage, CostUSD: &cost.USD, CostEstimated: cost.Estimated, CostUnconfirmed: cost.Unconfirmed,
		MemoryStatus: mem.Status, Outcome: "ok",
	})
	return TurnResult{OK: true, Response: result.Response, Usage: result.Usage, Cost: cost, Route: route, MemStatus: mem.Status}, nil
}
