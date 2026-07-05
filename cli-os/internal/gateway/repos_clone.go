// Clone-from-GitHub repo connect. The OS's "connect a local repo or clone from GitHub" flow:
// POST /v1/repos/clone shallow-clones a Git URL into a managed workspace directory under the
// gateway's data home, then registers it exactly like a local-path repo. This is an explicit,
// authenticated, human-initiated action from the dashboard — never autonomous.
//
// SECURITY:
//   - The clone destination is ALWAYS inside <data home>/workspaces/<repo id>, never a
//     caller-supplied path, so a clone can't write outside the managed area.
//   - Only https:// and ssh (git@host:...) URLs are accepted; file://, ext::, and other
//     git transports that can execute local commands are rejected.
//   - Same project-scope rule as /v1/repos: the repo lands in the acting token's project.
//   - git runs with credential prompting disabled so a private URL fails fast instead of
//     hanging the request waiting for a password.
package gateway

import (
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"

	"github.com/jackofall1232/l00prite/cli-os/internal/memory"
	"github.com/jackofall1232/l00prite/cli-os/internal/state"
	"github.com/jackofall1232/l00prite/cli-os/internal/util"
)

// allowedGitURL accepts https URLs and scp-style ssh (git@host:owner/repo). Everything else —
// file://, ext::, --upload-pack injection, bare local paths — is refused.
var httpsGitURL = regexp.MustCompile(`^https://[A-Za-z0-9._~:/?#\[\]@!$&'()*+,;=%-]+$`)
var sshGitURL = regexp.MustCompile(`^[A-Za-z0-9._-]+@[A-Za-z0-9._-]+:[A-Za-z0-9._~/-]+$`)

func acceptableGitURL(u string) bool {
	u = strings.TrimSpace(u)
	if strings.HasPrefix(u, "-") { // never let the URL look like a git flag
		return false
	}
	return httpsGitURL.MatchString(u) || sshGitURL.MatchString(u)
}

type repoCloneReq struct {
	ID  string `json:"id"`
	URL string `json:"url"`
}

// HandleRepoClone is POST /v1/repos/clone — clone a Git URL into the managed workspace and register it.
func (app *App) HandleRepoClone(w http.ResponseWriter, r *http.Request) {
	principal := app.requireToken(w, r)
	if principal == nil {
		return
	}
	var body repoCloneReq
	if err := decodeSetupBody(r, &body); err != nil {
		oaiError(w, 400, "Invalid JSON body", "invalid_request_error", "")
		return
	}
	id := strings.TrimSpace(body.ID)
	if id == "" || !validRepoID.MatchString(id) {
		oaiError(w, 400, `A repo id is required and must match [A-Za-z0-9._-]+.`, "invalid_request_error", "")
		return
	}
	url := strings.TrimSpace(body.URL)
	if !acceptableGitURL(url) {
		oaiError(w, 400, "Provide an https:// or git@host:owner/repo URL. Other git transports are not accepted.", "invalid_request_error", "bad_url")
		return
	}
	if _, err := exec.LookPath("git"); err != nil {
		oaiError(w, 500, "git is not installed on the machine running this gateway.", "configuration_error", "git_missing")
		return
	}

	// Refuse a duplicate id up front (the register step would 409 anyway, but we don't want to
	// clone into a dir for an id that's taken).
	var existing int
	if err := app.DB.QueryRowContext(state.Ctx(), `SELECT COUNT(*) FROM repos WHERE id = ?`, id).Scan(&existing); err != nil {
		oaiError(w, 500, "Database error: "+err.Error(), "api_error", "")
		return
	}
	if existing > 0 {
		oaiError(w, 409, `A repo named "`+id+`" is already registered. Remove it first.`, "invalid_request_error", "repo_exists")
		return
	}

	workspaces := filepath.Join(app.Cfg.Home, "workspaces")
	if err := os.MkdirAll(workspaces, 0o700); err != nil {
		oaiError(w, 500, "Could not create the workspace directory: "+err.Error(), "configuration_error", "")
		return
	}
	dest := filepath.Join(workspaces, id)
	if _, err := os.Stat(dest); err == nil {
		oaiError(w, 409, `A workspace directory for "`+id+`" already exists. Remove it or choose another id.`, "invalid_request_error", "workspace_exists")
		return
	}

	// git clone with prompting disabled (a private URL fails fast, never hangs).
	cmd := exec.CommandContext(r.Context(), "git", "clone", "--depth", "1", "--", url, dest)
	cmd.Env = append(os.Environ(), "GIT_TERMINAL_PROMPT=0", "GIT_ASKPASS=/bin/true")
	out, err := cmd.CombinedOutput()
	if err != nil {
		_ = os.RemoveAll(dest) // don't leave a half-clone behind
		oaiError(w, 400, "git clone failed: "+strings.TrimSpace(lastLine(string(out))), "invalid_request_error", "clone_failed")
		return
	}

	absRoot, _ := filepath.Abs(dest)
	if _, err := app.DB.ExecContext(state.Ctx(),
		`INSERT INTO repos(id,root,project,created_at) VALUES(?,?,?,?)`,
		id, absRoot, principal.Project, util.NowISO()); err != nil {
		_ = os.RemoveAll(dest)
		oaiError(w, 500, "Cloned but failed to register: "+err.Error(), "configuration_error", "")
		return
	}
	app.auditAs(principal, "repo.clone", id)
	fr := memory.RepoFreshness(absRoot)
	sendJSON(w, 200, map[string]any{
		"repo":   map[string]any{"id": id, "root": absRoot, "project": principal.Project, "cloned_from": url},
		"memory": map[string]any{"status": fr.Status, "present_count": fr.PresentCount, "total_files": fr.TotalFiles},
	})
}

func lastLine(s string) string {
	s = strings.TrimRight(s, "\n")
	if i := strings.LastIndex(s, "\n"); i >= 0 {
		return s[i+1:]
	}
	return s
}
