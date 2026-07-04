package server_test

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/jackofall1232/l00prite/cli-os/internal/config"
	"github.com/jackofall1232/l00prite/cli-os/internal/gateway"
	"github.com/jackofall1232/l00prite/cli-os/internal/security"
	"github.com/jackofall1232/l00prite/cli-os/internal/server"
	"github.com/jackofall1232/l00prite/cli-os/internal/state"
	"github.com/jackofall1232/l00prite/cli-os/internal/util"
)

// sse writes a set of raw SSE frames with a flush between each, simulating a real provider stream.
func sseServer(frames []string) *httptest.Server {
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("content-type", "text/event-stream")
		w.WriteHeader(200)
		fl, _ := w.(http.Flusher)
		for _, f := range frames {
			w.Write([]byte(f))
			if fl != nil {
				fl.Flush()
			}
		}
	}))
}

// TestNetworkStreamingTranslators exercises the NETWORK streaming path (not the mock/direct one the
// rest of the suite covers): the gateway connects to a real HTTP provider, reads SSE, and folds it
// into OpenAI chunks — once through the Anthropic native translator, once through openai-compat.
func TestNetworkStreamingTranslators(t *testing.T) {
	t.Setenv("LOOPRITE_HOME", t.TempDir())
	t.Setenv("LOOPRITE_MASTER_KEY", "")
	cfg := config.Load()
	config.EnsureHome(cfg)
	security.EnsureMasterKey(cfg.MasterKeyPath)
	db, _ := state.Open(cfg.DBPath)

	// Fake Anthropic: typed SSE events -> must fold to "Hi there".
	fakeAnthropic := sseServer([]string{
		"event: message_start\ndata: {\"type\":\"message_start\",\"message\":{\"usage\":{\"input_tokens\":7,\"output_tokens\":0}}}\n\n",
		"event: content_block_start\ndata: {\"type\":\"content_block_start\",\"index\":0,\"content_block\":{\"type\":\"text\"}}\n\n",
		"data: {\"type\":\"content_block_delta\",\"index\":0,\"delta\":{\"type\":\"text_delta\",\"text\":\"Hi \"}}\n\n",
		"data: {\"type\":\"content_block_delta\",\"index\":0,\"delta\":{\"type\":\"text_delta\",\"text\":\"there\"}}\n\n",
		"data: {\"type\":\"message_delta\",\"delta\":{\"stop_reason\":\"end_turn\"},\"usage\":{\"output_tokens\":4}}\n\n",
		"data: {\"type\":\"message_stop\"}\n\n",
	})
	defer fakeAnthropic.Close()

	// Fake OpenAI-compat: plain chunks + a usage chunk + [DONE] -> must fold to "Hello OAI".
	fakeOpenAI := sseServer([]string{
		"data: {\"choices\":[{\"delta\":{\"role\":\"assistant\",\"content\":\"\"}}]}\n\n",
		"data: {\"choices\":[{\"delta\":{\"content\":\"Hello\"}}]}\n\n",
		"data: {\"choices\":[{\"delta\":{\"content\":\" OAI\"}}]}\n\n",
		"data: {\"choices\":[{\"delta\":{},\"finish_reason\":\"stop\"}]}\n\n",
		"data: {\"usage\":{\"prompt_tokens\":5,\"completion_tokens\":2},\"choices\":[]}\n\n",
		"data: [DONE]\n\n",
	})
	defer fakeOpenAI.Close()

	encA, _ := security.EncryptSecret(cfg.MasterKeyPath, "sk-ant-test")
	encO, _ := security.EncryptSecret(cfg.MasterKeyPath, "sk-oai-test")
	db.Exec(`INSERT INTO providers(name,adapter,base_url,enc_key,enabled,is_default,created_at) VALUES('anthropic','native-messages',?,?,1,1,?)`, fakeAnthropic.URL, encA, util.NowISO())
	db.Exec(`INSERT INTO providers(name,adapter,base_url,enc_key,enabled,is_default,created_at) VALUES('openai','openai-compat',?,?,1,0,?)`, fakeOpenAI.URL, encO, util.NowISO())

	_, tok, _ := security.MintToken(db, "demo", nil, nil)
	app := &gateway.App{DB: db, Cfg: cfg, Aliases: cfg.Aliases}
	srv := httptest.NewServer(server.Handler(app))
	defer srv.Close()

	t.Run("anthropic native SSE folds to OpenAI chunks", func(t *testing.T) {
		resp := post(t, srv.URL, tok, map[string]any{"model": "anthropic/claude-opus-4-8", "stream": true, "messages": []any{map[string]any{"role": "user", "content": "hi"}}}, nil)
		if resp.StatusCode != 200 {
			t.Fatalf("want 200 got %d", resp.StatusCode)
		}
		text := bodyText(t, resp)
		if !strings.Contains(text, "data: [DONE]") {
			t.Fatalf("missing [DONE]")
		}
		if got := sseContent(text); got != "Hi there" {
			t.Fatalf("folded content = %q, want %q", got, "Hi there")
		}
	})

	t.Run("openai-compat SSE passes through", func(t *testing.T) {
		resp := post(t, srv.URL, tok, map[string]any{"model": "openai/gpt-x", "stream": true, "messages": []any{map[string]any{"role": "user", "content": "hi"}}}, nil)
		if resp.StatusCode != 200 {
			t.Fatalf("want 200 got %d", resp.StatusCode)
		}
		text := bodyText(t, resp)
		if !strings.Contains(text, "data: [DONE]") {
			t.Fatalf("missing [DONE]")
		}
		if got := sseContent(text); got != "Hello OAI" {
			t.Fatalf("folded content = %q, want %q", got, "Hello OAI")
		}
	})
}
