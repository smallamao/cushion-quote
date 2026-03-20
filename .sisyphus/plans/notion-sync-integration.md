# Notion Sync Integration Plan (Quote System -> Existing Notion Workflow)

## TL;DR

> **Quick Summary**: Integrate the quote system with existing Notion operations using stage-based, one-way synchronization: pipeline signals to `訂製資料`, and won-order execution records to `訂製訂單`.
>
> **Deliverables**:
> - Notion integration architecture and config model
> - Stage-based sync rules and property mapping
> - Reliable sync execution path (idempotency, retry, audit, rollback)
> - Verification and launch strategy
>
> **Estimated Effort**: Medium
> **Parallel Execution**: YES - 3 waves + final verification wave
> **Critical Path**: Schema contract -> Sync core -> Trigger wiring -> End-to-end verification

---

## Context

### Original Request
User wants planning first for integrating the new quote system into existing Notion operations where two Notion tables already exist:
- `訂製資料` (quote content / pipeline context)
- `訂製訂單` (won order details)

### Interview Summary
**Key Discussions**:
- Existing custom workflow is already in Notion.
- New quote system should feed Notion rather than replacing it.
- Planning-first approach requested.

**Research Findings**:
- Existing repo has no current Notion integration.
- Existing status lifecycle already exists in Sheets-backed APIs.

### Gap Review Note
- Metis consultation could not be completed due current authorization constraints on Claude subagent usage.
- This plan applies conservative guardrails and explicit decision checkpoints to compensate.

---

## Work Objectives

### Core Objective
Design and execute a robust Notion synchronization layer that preserves current Notion operational flow while using the quote system as the upstream source for key commercial lifecycle data.

### Concrete Deliverables
- Integration configuration model and environment contract
- Notion schema mapping document (system fields -> Notion properties)
- Stage-based sync policy and trigger rules
- Idempotent upsert and retry/rollback controls
- Rollout and validation playbook

### Definition of Done
- [ ] Both Notion databases can be updated from quote-system events with deterministic idempotency.
- [ ] Stage split is enforced (`sent/quoting` to `訂製資料`, `won/accepted` to `訂製訂單`).
- [ ] Sync failures are observable and retryable without duplicate records.

### Must Have
- One-way sync (quote system -> Notion) for v1.
- Stable external keys from system IDs.
- Explicit conflict policy and rollback control.

### Must NOT Have (Guardrails)
- No bidirectional write behavior in v1.
- No hidden side effects that block quote editing when Notion is unavailable.
- No ambiguous trigger logic that creates duplicate order records.

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** for execution verification. All checks are command/tool-driven.

### Test Decision
- **Infrastructure exists**: YES
- **Automated tests**: YES (Tests-after)
- **Framework**: Vitest / Node test command in project

### QA Policy
Every task must include executable QA scenarios using:
- **API/Backend**: Bash (`curl`) + JSON assertions
- **UI checks (if needed)**: Playwright scenario via automation
- **Integration reliability**: repeated run checks for idempotency and retry behavior

Evidence path convention:
- `.sisyphus/evidence/task-{N}-{scenario}.json|txt|png`

---

## Execution Strategy

### Parallel Execution Waves

Wave 1 (Foundation + Contracts):
- Task 1: Integration config and secret contract
- Task 2: Notion schema contract and field normalization rules
- Task 3: Event/trigger boundary definition for stage split
- Task 4: External key strategy and idempotency contract
- Task 5: Sync audit ledger model
- Task 6: Backfill policy and launch cutoff strategy

Wave 2 (Core Sync Engine):
- Task 7: Notion client wrapper and typed adapters
- Task 8: Upsert to `訂製資料` path
- Task 9: Upsert to `訂製訂單` path
- Task 10: Relation linking between two Notion databases
- Task 11: Retry and error classification pipeline
- Task 12: Non-blocking async dispatch from quote lifecycle updates

Wave 3 (Operational Hardening + Rollout):
- Task 13: Drift detection/reconciliation command
- Task 14: Kill switch and safe rollback controls
- Task 15: End-to-end integration tests and fixture matrix
- Task 16: Deployment checklist and runbook

Wave FINAL (Independent Review - parallel 4):
- F1: Plan compliance audit
- F2: Code quality and static checks
- F3: Real scenario QA replay
- F4: Scope fidelity check

Critical Path: 2 -> 4 -> 8/9 -> 10 -> 12 -> 15 -> FINAL

---

## TODOs

> EVERY task MUST have: Recommended Agent Profile + QA Scenarios + References.
> **A task WITHOUT QA Scenarios is INCOMPLETE.**

- [ ] 1. Integration config and Notion secret contract

  **What to do**:
  - Add `NOTION_API_KEY` and `NOTION_QUOTE_DATABASE_ID` / `NOTION_ORDER_DATABASE_ID` to `.env.example`
  - Create `src/lib/notion-client.ts` stub that exports typed `NotionClient` interface and env validation
  - Add placeholders to `.env.local`

  **Must NOT do**:
  - Do not make Notion calls blocking in the main request lifecycle
  - Do not hardcode any Notion IDs

  **Recommended Agent Profile**:
  - **Category**: `quick` — Env wiring and interface stub, well-defined

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 1 with Tasks 2–6)
  - **Blocks**: Tasks 7–16
  - **Blocked By**: None

  **References**:
  - `src/lib/sheets-client.ts` — existing API client pattern
  - `.env.local` — existing env pattern to extend
  - `@notionhq/client` npm package

  **Acceptance Criteria**:
  - [ ] `.env.example` updated with 3 Notion env vars
  - [ ] `src/lib/notion-client.ts` created with `getNotionClient()` returning typed interface

  **QA Scenarios**:
  ```
  Scenario: Client returns null when env vars missing
    Tool: Bash (node inline)
    Steps: Set NOTION_API_KEY=undefined, call getNotionClient()
    Expected Result: Returns null, no throw

  Scenario: Client initializes with valid env vars
    Tool: Bash (node inline)
    Steps: Set valid mock env vars, call getNotionClient()
    Expected Result: Returns object with .pages, .databases methods
  ```

---

- [ ] 2. Notion schema contract and field normalization rules

  **What to do**:
  - Define exact Notion property names and types for both databases (based on user screenshots)
  - Map each quote-system field to target Notion property with type coercion
  - Define `normalizeForQuoteRecord()`, `normalizeForOrderRecord()` functions

  **Must NOT do**:
  - Do not invent fields not confirmed in screenshots
  - Do not assume schema without user confirmation

  **Recommended Agent Profile**:
  - **Category**: `writing` — Specification document

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 1)
  - **Blocks**: Tasks 8, 9, 10
  - **Blocked By**: Task 1

  **References**:
  - `src/lib/types.ts` — QuoteVersionRecord, QuotePlanRecord, CaseRecord field definitions
  - User screenshots of 訂製資料 and 訂製訂單

  **Acceptance Criteria**:
  - [ ] `src/lib/notion-schema.ts` created with typed property maps
  - [ ] Each mapping: source field → target property, Notion type, coercion fn

  **QA Scenarios**:
  ```
  Scenario: Schema exports correct property count for each database
    Tool: Bash (node)
    Steps: Import schema, count QUOTE_PROPERTIES and ORDER_PROPERTIES
    Expected Result: QUOTE_PROPERTIES ≥8 fields, ORDER_PROPERTIES ≥10 fields
  ```

---

- [ ] 3. Event/trigger boundary definition for stage split

  **What to do**:
  - Define exact trigger rules:
    - `sent` (first `sentAt` set) → upsert to 訂製資料
    - `accepted` + case `won` + `wonVersionId === versionId` → upsert to 訂製訂單
  - Document `shouldSyncToQuoteDb()`, `shouldSyncToOrderDb()` — pure functions, no side effects

  **Must NOT do**:
  - Do not trigger on `draft` or `rejected`
  - Do not trigger on partial parent sync (both version+case must agree)

  **Recommended Agent Profile**:
  - **Category**: `quick` — Pure logic definition

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 1)
  - **Blocks**: Task 12
  - **Blocked By**: Task 1

  **References**:
  - `src/app/api/sheets/versions/route.ts` — where versionStatus transitions happen
  - `src/app/api/sheets/_v2-utils.ts:47` — reminderStatus calculation

  **Acceptance Criteria**:
  - [ ] `src/lib/notion-triggers.ts` created with both trigger functions
  - [ ] Unit tests cover: sent trigger, accepted trigger, rejected skip, draft skip

  **QA Scenarios**:
  ```
  Scenario: sent version triggers quote sync
    Tool: Bash (node)
    Steps: Mock version with versionStatus='sent', call shouldSyncToQuoteDb()
    Expected Result: true

  Scenario: draft version does not trigger
    Tool: Bash (node)
    Steps: Mock version with versionStatus='draft', call shouldSyncToQuoteDb()
    Expected Result: false

  Scenario: accepted + won case triggers order sync
    Tool: Bash (node)
    Steps: Mock accepted version + case with matching wonVersionId, call shouldSyncToOrderDb()
    Expected Result: true
  ```

---

- [ ] 4. External key strategy and idempotency contract

  **What to do**:
  - Primary key: `source_version_id = versionId` (immutable)
  - Revision key: `source_revision = max(version.updatedAt, case.updatedAt)`
  - `buildSyncPayload(version, case)` → deterministic hash
  - Document duplicate / stale / missing page handling

  **Must NOT do**:
  - Do not use mutable fields as primary keys
  - Do not assume page exists before upsert

  **Recommended Agent Profile**:
  - **Category**: `quick` — Specification of key strategy

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 1)
  - **Blocks**: Tasks 7, 8, 9
  - **Blocked By**: Task 1

  **References**:
  - `src/lib/types.ts` — versionId, updatedAt fields
  - `src/app/api/sheets/_settlement-utils.ts` — existing idempotency pattern

  **Acceptance Criteria**:
  - [ ] `src/lib/notion-idempotency.ts` created
  - [ ] `getIdempotencyKey(version)` returns versionId
  - [ ] `computePayloadHash(payload)` deterministic

  **QA Scenarios**:
  ```
  Scenario: Same versionId always returns same key
    Tool: Bash (node)
    Steps: Call getIdempotencyKey with same versionId twice
    Expected Result: Identical string

  Scenario: Hash changes when data changes
    Tool: Bash (node)
    Steps: Hash with totalAmount=10000, then 15000
    Expected Result: Different hashes
  ```

---

- [ ] 5. Sync audit ledger model

  **What to do**:
  - Define "Sync Ledger" Google Sheets tab: sync_id, source_version_id, target_database, notion_page_id, payload_hash, status, attempt_count, last_attempt_at, last_success_at, last_error
  - Implement `appendLedgerEntry()`, `updateLedgerEntry()`, `getLedgerEntry()`
  - Implement `getPendingRetries()` for retry worker

  **Must NOT do**:
  - Do not use Notion as ledger storage (must be Sheets)

  **Recommended Agent Profile**:
  - **Category**: `quick` — Follows existing Sheets API pattern

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 1)
  - **Blocks**: Tasks 11, 12
  - **Blocked By**: Task 1

  **References**:
  - `src/app/api/sheets/_settlement-utils.ts` — Sheets append pattern
  - `src/app/api/sheets/settlements/route.ts` — lookup by ID pattern

  **Acceptance Criteria**:
  - [ ] Sync Ledger tab defined in init route with 10 columns
  - [ ] `src/lib/notion-ledger.ts` created with typed interface

  **QA Scenarios**:
  ```
  Scenario: New ledger entry appends to Sheets
    Tool: Bash (curl)
    Steps: POST /api/sheets/init, create ledger entry
    Expected Result: Entry appears in ledger tab

  Scenario: Existing entry found by versionId
    Tool: Bash (node)
    Steps: Insert known versionId, call getLedgerEntry()
    Expected Result: Returns entry with correct status
  ```

---

- [ ] 6. Backfill policy and launch cutoff strategy

  **What to do**:
  - Define backfill scope: forward-only from go-live, or historical?
  - `sync_enabled_at` timestamp in system settings sheet
  - Backfill dry-run command: shows eligible records without writing

  **Must NOT do**:
  - Do not auto-backfill historical data without user confirmation
  - Do not mix backfill with live sync in same worker

  **Recommended Agent Profile**:
  - **Category**: `writing` — Policy definition

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 1)
  - **Blocks**: Task 15
  - **Blocked By**: None

  **Acceptance Criteria**:
  - [ ] `docs/notion-sync-backfill-policy.md` created
  - [ ] `syncCutoffDate` configurable in system settings
  - [ ] Backfill dry-run reports without writing to Notion

  **QA Scenarios**:
  ```
  Scenario: Backfill dry-run shows records without writing
    Tool: Bash (node)
    Steps: Set cutoff to 2026-01-01, run dry-run
    Expected Result: Shows eligible versions, Notion unchanged
  ```

---

- [ ] 7. Notion client wrapper and typed adapters

  **What to do**:
  - Install `@notionhq/client`
  - Wrap official client: `upsertPage(databaseId, pageId?, properties)`, `findPageByProperty()`, `archivePage()`
  - Respect rate limits (Retry-After header)

  **Must NOT do**:
  - Do not call Notion synchronously in Next.js handlers
  - Do not expose raw notion client

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high` — API wrapper with retry logic

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 2)
  - **Blocks**: Tasks 8, 9, 10
  - **Blocked By**: Tasks 1, 2, 4

  **References**:
  - `@notionhq/client` official SDK
  - `src/lib/sheets-client.ts` — client wrapper pattern

  **Acceptance Criteria**:
  - [ ] `npm i @notionhq/client` added
  - [ ] `src/lib/notion/api.ts` with typed wrappers

  **QA Scenarios**:
  ```
  Scenario: Client handles 429 with Retry-After
    Tool: Bash (node with mock)
    Steps: Mock 429 with Retry-After: 1, call upsertPage
    Expected Result: Retried after 1 second
  ```

---

- [ ] 8. Upsert to `訂製資料` path

  **What to do**:
  - Wire `shouldSyncToQuoteDb` into version lifecycle (when sentAt transitions from empty)
  - `syncQuoteToNotion(version, case)` — idempotent upsert
  - `POST /api/notion/sync/quote?versionId=X` for manual trigger / backfill

  **Must NOT do**:
  - Do not block version PATCH response
  - Do not upsert if payload hash unchanged

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high` — Business logic wiring

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 2)
  - **Blocks**: Task 12
  - **Blocked By**: Tasks 2, 3, 4, 7

  **References**:
  - `src/app/api/sheets/versions/route.ts:430` — PATCH version handler
  - `src/app/api/sheets/versions/route.ts:460` — existing async sync pattern

  **Acceptance Criteria**:
  - [ ] `syncQuoteToNotion()` callable and tested
  - [ ] Version sent transition triggers Notion upsert without blocking
  - [ ] Manual endpoint works
  - [ ] Re-running same versionId is idempotent

  **QA Scenarios**:
  ```
  Scenario: Sent version creates Notion page in 訂製資料
    Tool: Bash (curl)
    Steps: POST /api/notion/sync/quote?versionId=X, query Notion
    Expected Result: Page created with versionId stored

  Scenario: Re-triggering same version is idempotent
    Tool: Bash (curl)
    Steps: Run sync twice with same versionId
    Expected Result: Same page updated, no duplicate
  ```

---

- [ ] 9. Upsert to `訂製訂單` path

  **What to do**:
  - Wire `shouldSyncToOrderDb` into version lifecycle (accepted + won confirmed)
  - `syncOrderToNotion(version, case)` — idempotent upsert
  - `POST /api/notion/sync/order?versionId=X` for manual trigger / backfill

  **Must NOT do**:
  - Do not upsert if `wonVersionId !== versionId`
  - Do not upsert if parent case not yet synced

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high` — Business logic wiring

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 2)
  - **Blocks**: Task 12
  - **Blocked By**: Tasks 2, 3, 4, 7

  **References**:
  - `src/app/api/sheets/versions/route.ts:70-127` — accepted propagates to case
  - `src/app/api/sheets/versions/route.ts:460` — syncAutoCommissionSettlements pattern

  **Acceptance Criteria**:
  - [ ] `syncOrderToNotion()` callable and tested
  - [ ] Accepted + won triggers order upsert
  - [ ] Only winning version creates order page

  **QA Scenarios**:
  ```
  Scenario: Accepted + won creates Notion page in 訂製訂單
    Tool: Bash (curl)
    Steps: POST /api/notion/sync/order?versionId=X, query Notion
    Expected Result: Page created with correct properties

  Scenario: Non-winning version does not create order
    Tool: Bash (curl)
    Steps: accepted but wonVersionId points elsewhere, call sync
    Expected Result: No page created
  ```

---

- [ ] 10. Relation linking between two Notion databases

  **What to do**:
  - After upserting to `訂製訂單`, link to parent `訂製資料` page via Notion relation property
  - `linkOrderToQuote(orderPageId, quotePageId)` — called after successful order upsert

  **Must NOT do**:
  - Do not block order creation if relation link fails
  - Do not attempt relation if either page doesn't exist

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high` — Notion relation API call

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 2)
  - **Blocks**: Task 12
  - **Blocked By**: Tasks 8, 9

  **References**:
  - Notion API: `pages.update` with `relations` property type
  - User screenshots showing relation property

  **Acceptance Criteria**:
  - [ ] `linkOrderToQuote()` implemented and tested
  - [ ] Called automatically after successful order upsert

  **QA Scenarios**:
  ```
  Scenario: Order page links to quote page after creation
    Tool: Bash (curl + Notion query)
    Steps: Create both pages, call linkOrderToQuote, query relation property
    Expected Result: Relation array contains quote page ID
  ```

---

- [ ] 11. Retry and error classification pipeline

  **What to do**:
  - Classify errors: retryable (429, 5xx) vs permanent (400, 401, 403, 404)
  - Exponential backoff: 5min → 15min → 1hr → 4hr
  - Dead-letter after 4 failed attempts
  - `GET /api/notion/sync/retry` — processes pending ledger entries

  **Must NOT do**:
  - Do not retry permanent errors
  - Do not expose raw Notion errors to users

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high` — Error handling pipeline

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 2)
  - **Blocks**: Task 14
  - **Blocked By**: Tasks 5, 7

  **References**:
  - Task 5 ledger model
  - `src/app/api/sheets/settlements/route.ts` — error handling pattern

  **Acceptance Criteria**:
  - [ ] `classifyNotionError()` returns retryable | permanent
  - [ ] 4 failures → ledger entry marked `failed`
  - [ ] Retry endpoint processes pending entries

  **QA Scenarios**:
  ```
  Scenario: 429 triggers retry with backoff
    Tool: Bash (node with mock)
    Steps: Mock 429 with Retry-After: 1, call retry logic
    Expected Result: Retried after 1 second

  Scenario: 403 permanent error does not retry
    Tool: Bash (node with mock)
    Steps: Mock 403, call retry logic
    Expected Result: Marked permanent failure, not retried
  ```

---

- [ ] 12. Non-blocking async dispatch from quote lifecycle updates

  **What to do**:
  - Make all Notion sync calls non-blocking from main request
  - Option: Google Sheets "Outbox" tab as queue (same pattern as ledger)
  - Dispatch function writes to outbox, returns immediately
  - Background worker processes outbox reliably

  **Must NOT do**:
  - Do not let Notion outage block quote saves
  - Do not use fire-and-forget — need at-least-once via outbox

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high` — Async architecture decision

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 2)
  - **Blocks**: Tasks 13, 14
  - **Blocked By**: Tasks 3, 8, 9, 10, 11

  **References**:
  - `src/app/api/sheets/versions/route.ts:460` — existing syncAutoCommissionSettlements (inline anti-pattern to avoid)
  - Task 5 ledger (can reuse as outbox)

  **Acceptance Criteria**:
  - [ ] Version PATCH returns immediately without waiting for Notion
  - [ ] Sync jobs queued in outbox sheet
  - [ ] Background worker processes outbox reliably

  **QA Scenarios**:
  ```
  Scenario: Version PATCH returns within 500ms even if Notion is down
    Tool: Bash (curl with timing)
    Steps: Mock Notion delay 30s, PATCH version with sentAt
    Expected Result: Response <1s, Notion sync queued asynchronously
  ```

---

- [ ] 13. Drift detection and reconciliation command

  **What to do**:
  - For each ledger entry with status=success, compare payload hash with current source data
  - If mismatch and source newer → flag as drift
  - `GET /api/notion/sync/check?versionId=X` on-demand
  - Reconciliation report (full audit CSV)

  **Must NOT do**:
  - Do not auto-repair drift without user confirmation in v1
  - Do not flag drift for cosmetic-only changes

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high` — Data integrity tool

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 3)
  - **Blocks**: None
  - **Blocked By**: Tasks 8, 9, 10

  **References**:
  - Task 4 idempotency hash
  - Task 5 ledger model

  **Acceptance Criteria**:
  - [ ] `checkDrift(versionId)` returns in_sync | drifted | missing
  - [ ] Reconciliation report generates CSV

  **QA Scenarios**:
  ```
  Scenario: In-sync record passes drift check
    Tool: Bash (node)
    Steps: Sync version, call checkDrift with no changes
    Expected Result: 'in_sync'

  Scenario: Modified source data triggers drift detection
    Tool: Bash (node)
    Steps: Sync with totalAmount=10000, update Sheets to 15000, checkDrift
    Expected Result: 'drifted'
  ```

---

- [ ] 14. Kill switch and safe rollback controls

  **What to do**:
  - `NOTION_SYNC_ENABLED` env toggle (default: true)
  - When disabled: outbox processing stops, no new Notion calls, every blocked attempt logged
  - Rollback: archive Notion pages (not delete) via Task 7 archive
  - "Sync Status" on ledger: active | paused | rolled_back

  **Must NOT do**:
  - Do not delete Notion pages on rollback (archive only)
  - Do not silently ignore kill switch

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high` — Operational safety feature

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 3)
  - **Blocks**: Task 16
  - **Blocked By**: Task 11

  **References**:
  - Task 7 `archivePage()`
  - Task 12 outbox model

  **Acceptance Criteria**:
  - [ ] `NOTION_SYNC_ENABLED=false` halts all Notion writes
  - [ ] Kill switch blocks logged in ledger
  - [ ] Rollback archives pages (not deletes)

  **QA Scenarios**:
  ```
  Scenario: Kill switch stops all sync when disabled
    Tool: Bash (curl)
    Steps: Set NOTION_SYNC_ENABLED=false, trigger version sent
    Expected Result: No Notion page, ledger entry marked 'paused'

  Scenario: Rollback archives pages without deleting
    Tool: Bash (curl)
    Steps: Sync versions, run rollback
    Expected Result: Pages archived, ledger marked 'rolled_back'
  ```

---

- [ ] 15. End-to-end integration tests and fixture matrix

  **What to do**:
  - Vitest integration tests covering:
    - sent → Notion 訂製資料 page created
    - accepted + won → Notion 訂製訂單 page created
    - Re-sent same version → idempotent, no duplicate
    - Retry on 429 → eventually succeeds
    - Kill switch → no write
    - Drift → detected
  - Mock Notion API with `nock` or MSW

  **Must NOT do**:
  - Do not test against real Notion API
  - Do not test without ledger cleanup between tests

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high` — Integration test suite

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 3)
  - **Blocks**: FINAL wave
  - **Blocked By**: Tasks 8, 9, 10, 11, 12, 13, 14

  **References**:
  - `src/__tests__/` — existing test structure
  - `vitest.config.ts` — existing test runner

  **Acceptance Criteria**:
  - [ ] All 7 integration scenarios pass
  - [ ] Tests isolated (clean ledger between tests)

  **QA Scenarios**:
  ```
  Scenario: Full test suite passes
    Tool: Bash (npm test)
    Steps: npm test
    Expected Result: 0 failures

  Scenario: Idempotency under concurrent triggers
    Tool: Bash (node)
    Steps: Fire same versionId 3 times simultaneously
    Expected Result: Exactly 1 Notion page
  ```

---

- [ ] 16. Deployment checklist and runbook

  **What to do**:
  - Deployment checklist:
    - [ ] Notion integration created in Notion developers portal
    - [ ] Env vars set in Vercel project
    - [ ] Ledger tab initialized via `POST /api/sheets/init`
    - [ ] Backfill dry-run reviewed and approved
    - [ ] Kill switch verified working
    - [ ] Monitoring alerts configured
  - Document rollback procedure

  **Must NOT do**:
  - Do not deploy without user sign-off on backfill scope

  **Recommended Agent Profile**:
  - **Category**: `writing` — Documentation

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 3)
  - **Blocks**: FINAL
  - **Blocked By**: Task 14

  **Acceptance Criteria**:
  - [ ] `docs/notion-sync-runbook.md` created
  - [ ] Deployment checklist ≤15 items
  - [ ] Rollback procedure ≤5 steps

---

## Final Verification Wave (MANDATORY)

- [ ] F1. **Plan Compliance Audit** — Read plan end-to-end. Verify every Must Have implemented, every Must NOT absent. Check evidence files exist.

- [ ] F2. **Code Quality Review** — Run `npm run lint`, `npm run build`, `npm run test`. All pass. No `as any`, no `console.log` in production paths.

- [ ] F3. **Real Scenario QA** — Execute every QA scenario from every task. Test against staging Notion workspace first. Capture evidence.

- [ ] F4. **Scope Fidelity Check** — Tasks 1–16 cover everything agreed, nothing extra. No bidirectional sync, no blocking sync, no backfill without approval.

---

## Commit Strategy

- Wave 1: `feat(notion): add integration contracts and schema definitions`
- Wave 2: `feat(notion): implement sync engine for quote and order databases`
- Wave 3: `feat(notion): add operational hardening and deployment readiness`
- Each wave: run tests before commit

---

## Success Criteria

### Verification Commands
```bash
npm run test
npm run lint
npm run build
```

### Final Checklist
- [ ] Stage split sync validated (sent→quote DB, won→order DB)
- [ ] Idempotent upsert verified — no duplicate records on re-run
- [ ] Retry and error classification working
- [ ] Kill switch and rollback validated
- [ ] Quote saves unaffected by Notion outage
- [ ] Deployment checklist signed off by user (MANDATORY)

- [ ] F1. **Plan Compliance Audit**
- [ ] F2. **Code Quality Review**
- [ ] F3. **Real Scenario QA**
- [ ] F4. **Scope Fidelity Check**

---

## Commit Strategy

- Commit in small atomic units by wave and concern.
- Conventional commit format with clear scope.

---

## Success Criteria

### Verification Commands
```bash
npm run test
npm run lint
```

### Final Checklist
- [ ] Stage split sync behavior validated
- [ ] No duplicate Notion records under re-run
- [ ] Failure and retry behavior validated
- [ ] Rollback controls validated
