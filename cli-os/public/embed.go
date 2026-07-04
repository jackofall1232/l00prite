// Package public embeds the static control-plane dashboard so the single binary serves it with no
// external files. The canonical source remains public/dashboard.html.
package public

import _ "embed"

//go:embed dashboard.html
var Dashboard []byte
