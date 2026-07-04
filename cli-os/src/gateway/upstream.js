// Low-level upstream call helpers shared by the ingress streaming path and the internal turn
// primitive (turn.js). Extracted so a bridge hop reuses the exact same idempotency-aware,
// abort-aware call path as a top-level request — never by re-entering HTTP (which would re-read
// bridge headers and re-inject the bridge tool: the recursion hole Fable flagged).
import * as router from './router.js';

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const isRetryable = (status) => status === 429 || status === 408 || status >= 500;

// Returns { promise, cleanup }. cleanup() clears the timeout — call it only AFTER the response
// body/stream has been fully consumed, so a stalled body still aborts on timeout. Aborts on
// client disconnect too.
export function providerFetch(url, headers, body, { timeoutMs, clientSignal }) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(new Error('provider_timeout')), timeoutMs);
  const onClientAbort = () => ac.abort(new Error('client_disconnected'));
  if (clientSignal) {
    if (clientSignal.aborted) ac.abort();
    else clientSignal.addEventListener('abort', onClientAbort, { once: true });
  }
  const cleanup = () => { clearTimeout(timer); clientSignal?.removeEventListener?.('abort', onClientAbort); };
  const promise = fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal: ac.signal });
  return { promise, cleanup };
}

// Non-streaming provider call with idempotency-aware retry (a non-streaming call has flushed no
// client-visible bytes, so every attempt is safe to retry within the cap).
export async function callNonStream(adapter, { provider, model, openaiReq, apiKey, cfg, clientSignal }) {
  if (adapter.direct) return adapter.directFull(openaiReq, model); // mock: no network
  const body = adapter.buildRequest({ model, openaiReq, stream: false });
  const url = adapter.url(provider.base_url);
  const headers = adapter.headers(apiKey);
  let lastErr;
  for (let attempt = 0; attempt < cfg.retry.maxAttempts; attempt++) {
    const { promise, cleanup } = providerFetch(url, headers, body, { timeoutMs: cfg.requestTimeoutMs, clientSignal });
    try {
      const r = await promise;
      if (r.ok) return adapter.parseFull(await r.json(), model);
      const errText = await r.text().catch(() => '');
      if (!isRetryable(r.status)) throw router.httpError(r.status, `upstream ${provider.name} ${r.status}: ${errText.slice(0, 300)}`, 'upstream_error');
      lastErr = router.httpError(502, `upstream ${provider.name} ${r.status}`, 'upstream_error');
    } catch (e) {
      if (clientSignal?.aborted) throw router.httpError(499, 'client closed request', 'client_closed');
      if (e.status && !isRetryable(e.status)) throw e;
      lastErr = e;
    } finally { cleanup(); }
    await sleep(Math.min(cfg.retry.baseMs * 2 ** attempt, cfg.retry.maxMs));
  }
  throw lastErr || router.httpError(502, 'upstream failed', 'upstream_error');
}

// SSE frame parser (buffer is already CRLF-normalized to \n).
export function* parseSSE(buffer) {
  const parts = buffer.split('\n\n');
  for (let i = 0; i < parts.length - 1; i++) {
    let event = null; const dataLines = [];
    for (const line of parts[i].split('\n')) {
      if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
    }
    if (dataLines.length) yield { event, data: dataLines.join('\n') };
  }
}
