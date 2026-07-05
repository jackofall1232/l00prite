// Small shaping helpers local to the engine package: forgiving accessors over the map[string]any
// OpenAI shapes, tool-argument parsing, and the exit-code/summary extraction the loop needs.
// Named with an "Eng" suffix where a same-named helper exists in the gateway package to avoid any
// confusion — the engine deliberately does not import the gateway.
package engine

import (
	"encoding/json"
	"strconv"
	"strings"
)

func asMapEng(v any) map[string]any {
	if m, ok := v.(map[string]any); ok {
		return m
	}
	return nil
}

func asArray(v any) []any {
	if a, ok := v.([]any); ok {
		return a
	}
	return nil
}

func asStrEng(v any) string {
	if s, ok := v.(string); ok {
		return s
	}
	return ""
}

// parseArgs accepts a tool-call "arguments" value that may be a JSON string or an already-decoded
// object (providers differ), returning a map (empty on anything unparseable — never nil).
func parseArgs(raw string) map[string]any {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return map[string]any{}
	}
	var m map[string]any
	if err := json.Unmarshal([]byte(raw), &m); err != nil || m == nil {
		return map[string]any{}
	}
	return m
}

// parseExitCode reads the "exit_code: N" line the Toolbox's run_command prepends to its result.
// A missing/garbled code is treated as a failure (-1), never as success.
func parseExitCode(result string) int {
	for _, line := range strings.Split(result, "\n") {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, "exit_code:") {
			n, err := strconv.Atoi(strings.TrimSpace(strings.TrimPrefix(line, "exit_code:")))
			if err != nil {
				return -1
			}
			return n
		}
	}
	return -1
}

// firstLines returns the first n lines of s.
func firstLines(s string, n int) string {
	lines := strings.Split(s, "\n")
	if len(lines) > n {
		lines = lines[:n]
	}
	return strings.Join(lines, "\n")
}
