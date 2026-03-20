# Draft: Notion Sync Integration

## Requirements (confirmed)
- User has two Notion databases already in production use:
  - 訂製資料: quote/pipeline information
  - 訂製訂單: won order execution details
- Existing quote system is being introduced and should sync into existing Notion workflow.
- User asked to start with planning first.
- Constraint: avoid Claude subagent calls for now (authorization issue).

## Technical Decisions
- Initial direction: one-way sync from quote system to Notion.
- Stage split direction:
  - sent/quoting stage -> 訂製資料
  - won/accepted stage -> 訂製訂單
- Use idempotent upsert with stable source IDs.

## Research Findings
- Current repo has no Notion integration code or env wiring.
- Existing lifecycle states exist in Sheets-backed API flow (version status, quote/case status propagation).

## Open Questions
- [DECISION NEEDED] Final trigger semantics: what exact status should create order record in 訂製訂單?
- [DECISION NEEDED] Notion property map for required fields and expected property types.
- [DECISION NEEDED] Backfill scope: historical records or forward-only from go-live.

## Scope Boundaries
- INCLUDE: planning architecture, sync boundaries, mapping strategy, reliability and verification plan.
- EXCLUDE: implementation code changes in this planning phase.
