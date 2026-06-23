# Proposal: Pluggable Observability for nsflow (Trace + Analysis)

**Author:** Sourav Jyoti Barman
**Status:** Draft for maintainer review
**Related:** nsflow PR #209 ("Add Observability for Agent Invocations"), issue #208

---

## 1. What we want

The observability feature from PR #209 — per-step **duration, token cost, latency, and
LLM-call counts** for agents, tools, and sub-networks, surfaced as a **Trace** view and an
**`/analysis`** page. The data already exists: it is emitted by neuro-san on the agent
message stream (token-accounting `AgentMessage.structure`), so no neuro-san changes are
needed. PR #209 confirms this: *"Uses timing, token, and cost data already emitted by
neuro-san. No changes required in neuro-san."*

## 2. The constraint we are trying to respect

We understand you do **not** want the full ~3000-line feature living in the nsflow repo and
carried as maintenance burden. We agree. This proposal keeps **the feature code in a
separate, independently-versioned repository** that we own, and asks nsflow to accept only a
**small, generic extension seam** — not the feature itself.

## 3. The hard reality we discovered (and why it shapes the design)

Most downstream consumers — including **neuro-san-studio**, which is what we actually run —
do **not** build the nsflow frontend from source. They install nsflow as a **pip wheel**
(`nsflow==0.6.15`) that ships a **prebuilt, compiled frontend** (`prebuilt_frontend/dist`).
neuro-san-studio launches it via `uvicorn nsflow.backend.main:app` and serves that static
bundle. There is **no `yarn dev`** in that path.

**Implication:** a frontend feature cannot be injected as an external JS package for these
users, because the React source is already compiled and frozen in the wheel. A new
component/route/tab has to be **present in the nsflow frontend bundle** to reach them.

The good news: nsflow **already** has the right mechanism for this. The prebuilt frontend
reads runtime feature flags (`NSFLOW_PLUGIN_*`) from `/api/v1/vite_config.json`, and
neuro-san-studio already sets such flags via env (e.g. it sets `NSFLOW_PLUGIN_CRUSE`). The
backend already conditionally mounts optional routers by env flag (e.g.
`if NSFLOW_PLUGIN_VQA_ENDPOINT: router.include_router(...)`).

So the split that actually works for prebuild consumers is:

| Half | Where it lives | Why |
|---|---|---|
| **Backend** (trace WS endpoint, DB writer, stream consumer, `/analysis` API) | **External pip package** we own, installed alongside nsflow, mounted by an env-gated router include. | Backend is loaded at runtime; an optional dependency works cleanly. |
| **Frontend** (Trace view, `/analysis` page) | **Merged into nsflow frontend source**, **off by default**, gated behind a new `NSFLOW_PLUGIN_OBSERVABILITY` flag. | Prebuild users get it only if studio flips the flag; it ships dark otherwise. |

This means the frontend *does* land in your repo — but **dark, flag-gated, and disabled by
default**, identical in spirit to the Cruse/VQA plugins you already maintain. The heavy,
fast-moving logic (data parsing, aggregation, storage) stays external in our package.

## 4. The seam we ask you to accept (small + generic + idiomatic)

All three mirror patterns nsflow already uses.

### 4a. Backend — one env-gated optional router include (`backend/api/router.py`)
```python
NSFLOW_PLUGIN_OBSERVABILITY = os.getenv("NSFLOW_PLUGIN_OBSERVABILITY", None)
...
if NSFLOW_PLUGIN_OBSERVABILITY:
    try:
        from nsflow_observability.backend import router as observability_router
        router.include_router(observability_router, tags=["Observability"])
    except ImportError:
        # external package not installed; feature stays off
        ...
```
This is the same shape as the existing `NSFLOW_PLUGIN_VQA_ENDPOINT` block. Zero feature code
in nsflow — it imports from our package only when the flag is on.

### 4b. Frontend flag (`frontend/src/utils/config.ts`)
Add one field + one accessor, mirroring `pluginCruse`:
```ts
// AppRuntimeConfig:
NSFLOW_PLUGIN_OBSERVABILITY: boolean;
// getFeatureFlags():
pluginObservability: !!c.NSFLOW_PLUGIN_OBSERVABILITY,
```

### 4c. Frontend route (`frontend/src/app/routes.tsx`)
```tsx
const Analysis = React.lazy(() => import('../pages/Analysis/Analysis'));
...
{pluginObservability && (
  <Route path="/analysis" element={<Suspense fallback={null}><Analysis/></Suspense>} />
)}
```
Same `{pluginCruse && <Route .../>}` pattern already in the file.

### 4d. (Optional, only if we want the in-chat Trace tab) `TabbedChatPanel.tsx`
The `/analysis` *page* is a pure route and needs nothing more. The in-chat **Trace tab**
requires the panel to render an optional extra tab when the flag is on. If you prefer the
smallest footprint, we **drop the in-chat tab** and ship Trace as its own `/trace` route —
no `TabbedChatPanel` change at all. We recommend starting route-only.

## 5. What we own and maintain (separate repo)

```
nsflow-observability/                 (our private repo, independently versioned)
  backend/                            (pip package: nsflow-observability)
    router.py                         trace WebSocket + /analysis aggregation API
    trace_event_writer.py             persists trace events (from PR #209)
    models.py                         DB models for trace events
    stream_consumer.py                consumes neuro-san token-accounting AgentMessages
  frontend/                           (the React source we contribute to nsflow, dark by default)
    pages/Analysis/*                  Analysis page (from PR #209)
    components/trace/*                TracePanel, TraceTreeView, Gantt, formatters (from PR #209)
```

The frontend components are contributed once into nsflow (behind the flag); future iteration
on parsing/aggregation/storage happens in our backend package and ships on **our** release
cadence, not nsflow's.

## 6. Lifecycle for neuro-san-studio (the real consumer)

1. `pip install nsflow-observability` (our package) alongside `nsflow`.
2. neuro-san-studio sets `NSFLOW_PLUGIN_OBSERVABILITY=true` (one line, next to its existing
   `NSFLOW_PLUGIN_CRUSE` env wiring).
3. Prebuilt nsflow frontend sees the flag in `vite_config.json` → mounts the `/analysis`
   route. Backend sees the env flag → mounts our router. Done — no rebuild required by the
   end user.

When the flag is off (the default), nsflow behaves exactly as today and our package is inert.

## 7. Why this is a good deal for nsflow

- **No 3000-line feature in your tree** — only ~30 lines of generic, flag-gated seam, plus
  dark-by-default frontend components that match your existing plugin conventions.
- **Reuses your own patterns** (`NSFLOW_PLUGIN_*` flags, conditional router includes) — no
  new architecture to learn or own.
- **No neuro-san changes.** Data is already on the stream.
- **The maintenance that actually churns** (metrics logic, storage, aggregation) lives in our
  repo and our release cycle.

## 8. Open questions for you

1. Are you OK with the frontend components living in-tree **dark/flag-gated** (required for
   prebuild consumers), or do you want them out entirely (which would limit the feature to
   source-build users only)?
2. Route-only (`/analysis`, `/trace`) to start, deferring the in-chat Trace tab? (Our
   recommendation.)
3. Preferred flag name — `NSFLOW_PLUGIN_OBSERVABILITY`, or align to another convention?
4. Any constraint on the external backend package name / where it's published?

---

We're happy to open the seam PR small and reviewable, and keep everything else on our side.
