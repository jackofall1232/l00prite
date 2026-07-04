// Package server is the HTTP(S) server. It routes the OpenAI-compatible surface, serves the embedded
// dashboard, and enforces safe-by-default startup (no non-loopback bind without TLS; master key must
// exist). Ported from server.js. The dashboard is embedded (public.Dashboard), so it needs no files
// on disk — consistent with the single-static-binary goal.
package server

import (
	"fmt"
	"net/http"
	"os"
	"time"

	"github.com/jackofall1232/l00prite/cli-os/internal/config"
	"github.com/jackofall1232/l00prite/cli-os/internal/gateway"
	pep "github.com/jackofall1232/l00prite/cli-os/internal/policy"
	"github.com/jackofall1232/l00prite/cli-os/internal/state"
	"github.com/jackofall1232/l00prite/cli-os/public"
)

func serveDashboard(w http.ResponseWriter) {
	if len(public.Dashboard) == 0 {
		w.Header().Set("content-type", "text/plain")
		w.WriteHeader(200)
		w.Write([]byte("l00prite CLI-OS is running. Dashboard asset not found."))
		return
	}
	w.Header().Set("content-type", "text/html; charset=utf-8")
	w.Header().Set("content-length", fmt.Sprint(len(public.Dashboard)))
	w.WriteHeader(200)
	w.Write(public.Dashboard)
}

func notFound(w http.ResponseWriter) {
	w.Header().Set("content-type", "application/json")
	w.WriteHeader(404)
	w.Write([]byte(`{"error":{"message":"Not found","type":"invalid_request_error"}}`))
}

// Handler builds the request router with a top-level recover (any panic becomes a 500).
func Handler(app *gateway.App) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if rec := recover(); rec != nil {
				// Best-effort 500 if nothing was written yet.
				defer func() { _ = recover() }()
				w.Header().Set("content-type", "application/json")
				w.WriteHeader(500)
				w.Write([]byte(`{"error":{"message":"Internal error","type":"api_error"}}`))
			}
		}()
		p := r.URL.Path
		switch {
		case r.Method == http.MethodGet && (p == "/" || p == "/dashboard"):
			serveDashboard(w)
		case r.Method == http.MethodGet && p == "/healthz":
			app.HandleHealth(w, r)
		case r.Method == http.MethodGet && p == "/v1/models":
			app.HandleModels(w, r)
		case r.Method == http.MethodPost && p == "/v1/chat/completions":
			app.HandleChatCompletion(w, r)
		default:
			notFound(w)
		}
	})
}

// Overrides let `serve --host/--port` override config at boot.
type Overrides struct {
	Host string
	Port int
}

func staleAfterMs(cfg config.Config) int64 {
	v := int64(cfg.Retry.MaxAttempts*cfg.RequestTimeoutMs) + 60_000
	if v < 10*60_000 {
		v = 10 * 60_000
	}
	return v
}

// Start boots the gateway: load config, validate (refuse insecure), open the db, reap stale
// reservations (once + periodically), and listen. Blocks. Exits the process on a fatal config error.
func Start(ov Overrides) {
	cfg := config.Load()
	if ov.Host != "" {
		cfg.Host = ov.Host
	}
	if ov.Port != 0 {
		cfg.Port = ov.Port
	}
	if problems := config.ValidateForServe(cfg); len(problems) > 0 {
		fmt.Fprintln(os.Stderr, "Refusing to start — fix these first:")
		for _, p := range problems {
			fmt.Fprintln(os.Stderr, "  • "+p)
		}
		os.Exit(1)
	}
	db, err := state.Open(cfg.DBPath)
	if err != nil {
		fmt.Fprintln(os.Stderr, "Failed to open database: "+err.Error())
		os.Exit(1)
	}
	stale := staleAfterMs(cfg)
	if n := pep.ReapStaleReservations(db, stale); n > 0 {
		fmt.Printf("  • reaped %d stale reservation(s)\n", n)
	}
	go func() {
		t := time.NewTicker(5 * time.Minute)
		defer t.Stop()
		for range t.C {
			pep.ReapStaleReservations(db, stale)
		}
	}()

	app := &gateway.App{DB: db, Cfg: cfg, Aliases: cfg.Aliases}
	srv := &http.Server{Addr: fmt.Sprintf("%s:%d", cfg.Host, cfg.Port), Handler: Handler(app)}

	scheme := "http"
	if cfg.TLS != nil {
		scheme = "https"
	}
	fmt.Printf("l00prite CLI-OS listening on %s://%s:%d\n", scheme, cfg.Host, cfg.Port)
	fmt.Printf("  • OpenAI endpoint : %s://%s:%d/v1/chat/completions\n", scheme, cfg.Host, cfg.Port)
	fmt.Printf("  • Dashboard       : %s://%s:%d/\n", scheme, cfg.Host, cfg.Port)

	if cfg.TLS != nil {
		err = srv.ListenAndServeTLS(cfg.TLS.CertPath, cfg.TLS.KeyPath)
	} else {
		err = srv.ListenAndServe()
	}
	if err != nil && err != http.ErrServerClosed {
		fmt.Fprintln(os.Stderr, "server error: "+err.Error())
		os.Exit(1)
	}
}
