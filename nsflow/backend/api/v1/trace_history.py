# Copyright © 2025 Cognizant Technology Solutions Corp, www.cognizant.com.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.
#
# END COPYRIGHT

"""
Read-side endpoints over the trace_events table. Used by the Analysis page to
roll up cost / tokens / calls across many invocations. The live Trace tab does
not call these; it consumes the WebSocket stream directly.
"""

import logging
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import JSONResponse
from sqlalchemy import func
from sqlalchemy.orm import Session

from nsflow.backend.db.database import get_nss_db
from nsflow.backend.db.models import TraceEvent

router = APIRouter(prefix="/api/v1/trace")
_logger = logging.getLogger(__name__)


def _apply_filters(query, network: Optional[str], since: Optional[float], until: Optional[float]):
    if network:
        query = query.filter(TraceEvent.network == network)
    if since is not None:
        query = query.filter(TraceEvent.received_at >= since)
    if until is not None:
        query = query.filter(TraceEvent.received_at <= until)
    return query


@router.get("/invocations")
def list_invocations(
    network: Optional[str] = Query(default=None),
    since: Optional[float] = Query(default=None, description="Epoch seconds, inclusive"),
    until: Optional[float] = Query(default=None, description="Epoch seconds, inclusive"),
    limit: int = Query(default=200, ge=1, le=2000),
    db: Session = Depends(get_nss_db),
) -> JSONResponse:
    """
    Return one row per invocation_id with totals. Prefers the network_total
    summary row when present (carries the authoritative aggregate); otherwise
    sums agent/sub_network rows for that invocation.
    """
    try:
        # First pull the (invocation_id, network) pairs in scope, ordered most-recent first.
        scope_q = db.query(
            TraceEvent.invocation_id,
            TraceEvent.network,
            func.min(TraceEvent.received_at).label("started_at"),
            func.max(TraceEvent.received_at).label("ended_at"),
        )
        scope_q = _apply_filters(scope_q, network, since, until)
        scope_q = (
            scope_q.filter(TraceEvent.invocation_id != "")
            .group_by(TraceEvent.invocation_id, TraceEvent.network)
            .order_by(func.max(TraceEvent.received_at).desc())
            .limit(limit)
        )
        scope_rows = scope_q.all()
        ids = [r.invocation_id for r in scope_rows]
        if not ids:
            return JSONResponse(content={"invocations": []})

        # Prompt comes from invocation_start rows.
        prompt_rows = (
            db.query(TraceEvent.invocation_id, TraceEvent.prompt)
            .filter(TraceEvent.invocation_id.in_(ids))
            .filter(TraceEvent.kind == "invocation_start")
            .all()
        )
        prompts = {r.invocation_id: (r.prompt or "") for r in prompt_rows}

        # A single user invocation can span the top-level network plus any
        # sub-networks it dispatches via "/foo/bar". Each of those emits its
        # own network_total row. The full cost of one invocation is the sum
        # of all those network_total rows for that invocation_id.
        total_rows = (
            db.query(
                TraceEvent.invocation_id,
                func.coalesce(func.sum(TraceEvent.total_cost), 0.0).label("cost"),
                func.coalesce(func.sum(TraceEvent.total_tokens), 0).label("tokens"),
                func.coalesce(func.sum(TraceEvent.successful_requests), 0).label("calls"),
            )
            .filter(TraceEvent.invocation_id.in_(ids))
            .filter(TraceEvent.kind == "network_total")
            .group_by(TraceEvent.invocation_id)
            .all()
        )
        totals = {r.invocation_id: r for r in total_rows}

        # Fallback aggregate for invocations that never emitted a network_total.
        fallback_rows = (
            db.query(
                TraceEvent.invocation_id,
                func.coalesce(func.sum(TraceEvent.total_cost), 0.0).label("cost"),
                func.coalesce(func.sum(TraceEvent.total_tokens), 0).label("tokens"),
                func.coalesce(func.sum(TraceEvent.successful_requests), 0).label("calls"),
            )
            .filter(TraceEvent.invocation_id.in_(ids))
            .filter(TraceEvent.kind.in_(("agent", "sub_network")))
            .group_by(TraceEvent.invocation_id)
            .all()
        )
        fallbacks = {r.invocation_id: r for r in fallback_rows}

        # Model/provider come from the top-level network_total (the one whose
        # `agent` equals the user-invoked network). Summed totals across
        # sub-networks may mix providers; we report the top-level for display.
        top_rows = (
            db.query(TraceEvent.invocation_id, TraceEvent.model, TraceEvent.provider)
            .filter(TraceEvent.invocation_id.in_(ids))
            .filter(TraceEvent.kind == "network_total")
            .filter(TraceEvent.agent == TraceEvent.network)
            .all()
        )
        top = {r.invocation_id: r for r in top_rows}

        out: List[Dict[str, Any]] = []
        for r in scope_rows:
            t = totals.get(r.invocation_id)
            if t is not None:
                cost = float(t.cost or 0.0)
                tokens = int(t.tokens or 0)
                calls = int(t.calls or 0)
            else:
                f = fallbacks.get(r.invocation_id)
                cost = float(f.cost) if f else 0.0
                tokens = int(f.tokens) if f else 0
                calls = int(f.calls) if f else 0
            tp = top.get(r.invocation_id)
            model = tp.model if tp else None
            provider = tp.provider if tp else None
            out.append(
                {
                    "invocation_id": r.invocation_id,
                    "network": r.network,
                    "prompt": prompts.get(r.invocation_id, ""),
                    "started_at": r.started_at,
                    "ended_at": r.ended_at,
                    "duration_s": (r.ended_at - r.started_at) if r.ended_at and r.started_at else None,
                    "total_cost": cost,
                    "total_tokens": tokens,
                    "llm_calls": calls,
                    "model": model,
                    "provider": provider,
                }
            )
        return JSONResponse(content={"invocations": out})

    except Exception as exc:  # pylint: disable=broad-except
        _logger.exception("Failed to list invocations")
        raise HTTPException(status_code=500, detail="Failed to list invocations") from exc


@router.get("/rollups")
def rollups(
    group_by: str = Query(default="network", pattern="^(network|model|agent)$"),
    network: Optional[str] = Query(default=None),
    since: Optional[float] = Query(default=None),
    until: Optional[float] = Query(default=None),
    db: Session = Depends(get_nss_db),
) -> JSONResponse:
    """
    Server-side aggregations. `group_by=network` and `group_by=model` use
    network_total rows so the cost is the authoritative network-level number.
    `group_by=agent` rolls up per-agent rows so it reflects within-network
    activity (use the `network` filter to scope to one network).
    """
    try:
        if group_by in ("network", "model"):
            # A single user invocation can include sub-network calls that each
            # emit their own network_total row. The total cost of that
            # invocation is the SUM of those rows. We aggregate at network /
            # model granularity by summing every network_total in scope; the
            # invocations count uses DISTINCT invocation_id so it stays right
            # even with multiple network_total rows per invocation.
            if group_by == "network":
                col = TraceEvent.network
            else:
                col = TraceEvent.model
            q = (
                db.query(
                    col.label("key"),
                    func.count(func.distinct(TraceEvent.invocation_id)).label("invocations"),
                    func.coalesce(func.sum(TraceEvent.total_cost), 0.0).label("cost"),
                    func.coalesce(func.sum(TraceEvent.total_tokens), 0).label("tokens"),
                    func.coalesce(func.sum(TraceEvent.successful_requests), 0).label("calls"),
                )
                .filter(TraceEvent.kind == "network_total")
            )
            q = _apply_filters(q, network, since, until)
            q = q.group_by(col).order_by(func.sum(TraceEvent.total_cost).desc())
            rows = q.all()
            return JSONResponse(
                content={
                    "rows": [
                        {
                            "key": r.key,
                            "invocations": int(r.invocations),
                            "cost": float(r.cost or 0.0),
                            "tokens": int(r.tokens or 0),
                            "llm_calls": int(r.calls or 0),
                        }
                        for r in rows
                    ]
                }
            )

        # group_by == "agent"
        q = (
            db.query(
                TraceEvent.agent.label("agent"),
                TraceEvent.kind.label("kind"),
                func.count(TraceEvent.id).label("hits"),
                func.coalesce(func.sum(TraceEvent.total_cost), 0.0).label("cost"),
                func.coalesce(func.sum(TraceEvent.total_tokens), 0).label("tokens"),
                func.coalesce(func.sum(TraceEvent.successful_requests), 0).label("calls"),
                func.coalesce(func.sum(TraceEvent.duration_s), 0.0).label("total_duration_s"),
            )
            .filter(TraceEvent.kind.in_(("agent", "sub_network", "tool", "external_agent")))
        )
        q = _apply_filters(q, network, since, until)
        q = (
            q.group_by(TraceEvent.agent, TraceEvent.kind)
            .order_by(func.sum(TraceEvent.total_cost).desc())
        )
        rows = q.all()
        return JSONResponse(
            content={
                "rows": [
                    {
                        "agent": r.agent,
                        "kind": r.kind,
                        "hits": int(r.hits),
                        "cost": float(r.cost or 0.0),
                        "tokens": int(r.tokens or 0),
                        "llm_calls": int(r.calls or 0),
                        "total_duration_s": float(r.total_duration_s or 0.0),
                    }
                    for r in rows
                ]
            }
        )

    except Exception as exc:  # pylint: disable=broad-except
        _logger.exception("Failed to compute rollups")
        raise HTTPException(status_code=500, detail="Failed to compute rollups") from exc
