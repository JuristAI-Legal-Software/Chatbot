# SeriesAI Email Agent Tool-Calls — Chatbot (LibreChat) Spec

Covers the tool definitions, context injection, and approval-gate UI pattern
needed in the LibreChat-based Chatbot for SeriesAI email-first features.

Related cross-repo specs:
- Atticus-Back-End: `docs/contracts/seriesai_email_agent_contract.md`
- django-hub:       `docs/contracts/seriesai_email_triggers_django_contract.md`
- LibreChat tool coverage (existing LitigAI baseline): `docs/librechat-tool-calling-coverage.md`
- Top-level map: `../SERIESAI-SPEC-MAP.md` (workspace root)

---

## 1. Product Context

SeriesAI positions the assistant as **autonomous and proactive** —
"Directly in your inbox. 1-click setup. Never need to login."
The three-step model is: **Describe → Agent Acts → Review & Approve**.

The Chatbot is the **management and review layer**. Primary value delivery
(proactive SAFE drafts, round updates, deadline alerts) happens in email context.
The Chatbot's tool-calls must be able to trigger all email-delivered actions,
and must also surface approval-pending states so users can approve or reject
in-app when they choose to visit.

Refer to `docs/architecture/intent-routing-standards.md` in Atticus-Back-End
for the `ACTION_MAP` pattern that backs these tools on the Lambda side.

---

## 2. System Prompt Context Injection

All SeriesAI assistant sessions must inject these fields into the system prompt
before tool definitions are presented to the model:

```
appId: "3" | "4"
organizationId: "<active organization UUID>"
workspaceMode: "portfolio" | "single"
activePracticeArea: "deal" | "founder"
activeLifecycleStage: "<stage name>"
```

These come from `PracticeAreaContext` on the frontend (see
`SeriesAI-frontend/src/components/pages/Dashboard/Atticus/Integrations/SERIESAI-SUB-SPEC.md`).

The system prompt must also include the mandatory legal disclaimer:
> SeriesAI is Venture Intelligent AI. It is not a law firm and does not provide
> legal advice. It is not a broker-dealer, investment adviser, or financial-services
> firm and does not offer or recommend securities. All legal, tax, and investment
> decisions remain the user's responsibility.

The model must reproduce this disclaimer in any message that contains financial
calculations, cap table projections, or document generation results.

---

## 3. New Tool Definitions

Add these six tools to the SeriesAI agent tool registry. All tools require
`appId` and `organizationId` to be set in context; reject with a descriptive
error if either is missing.

New tools live in `packages/api/` (TypeScript, per the Chatbot workspace rules),
not in `api/` (legacy JS).

### 3.1 `triggerSafeDraft`

**Description:** Compose and queue a SAFE (Simple Agreement for Future Equity) draft
for delivery to the founder's inbox. The draft is queued for approval — it is
NOT sent to investors until the user approves.

**Parameters:**
```typescript
{
  investorName: string;          // name of the investor
  investorEmail: string;         // investor's email address
  investmentAmount: number;      // USD
  valuationCap?: number;         // USD, optional
  discountRate?: number;         // percentage, optional (e.g. 20 for 20%)
  proRataRights?: boolean;
  roundId?: string;              // associate with an existing FinancingRound
}
```

**Backend path:**
`Lambda_intentHandler.py` (`document_generation_request` intent) →
`Lambda_cap_table_document_coordinator.py` →
`OutboundEmailTable` with `emailType: safe_draft_notification`,
`awaitingUserResponse: true`

**Response to model:** Confirmation that the draft is queued; include a
`pendingActionId` (the `requestId` from `OutboundEmailTable`) so the UI
can render the approval card.

---

### 3.2 `sendRoundUpdate`

**Description:** Send a round progress summary to all ExternalDealParticipants
on the active FinancingRound who have `accessScope ≥ view_only`.

**Parameters:**
```typescript
{
  roundId: string;
  message?: string;              // optional custom message to include
  includeCapTableSummary?: boolean;
}
```

**Backend path:**
`Lambda_outboundEmailOrchestrator.py` with `emailType: round_update`

**Response to model:** Count of recipients queued; list of `participantType`
values included (not individual email addresses — privacy).

---

### 3.3 `queryCapTableOwnership`

**Description:** Compute current ownership percentages from the committed cap table
ledger. Optionally send the result to the requesting user's email.

**Parameters:**
```typescript
{
  asOf?: string;                 // ISO date, defaults to now
  sendToEmail?: boolean;         // if true, queue result as email reply
  includeScenarios?: boolean;    // if true, include non-committed scenario projections
                                 // (labeled as non-committed in output)
}
```

**Backend path:**
`Lambda_cap_table_email_intent_handler.py` → `ownership_answer` action on
`Lambda_cap_table_engine.py`

**Response to model:** Structured ownership breakdown by stakeholder category.
If `includeScenarios: true`, scenario data must be clearly labeled
`[PROJECTION — not committed to cap table]`.

---

### 3.4 `scheduleComplianceDeadline`

**Description:** Create a compliance deadline and schedule email reminders at
the appropriate pre-warning and warning offsets.

**Parameters:**
```typescript
{
  deadlineType:
    | "83b_election"
    | "form_d"
    | "delaware_franchise_tax"
    | "board_meeting"
    | "option_grant_409a"
    | "round_closing";
  dueDate: string;               // ISO date
  linkedObjectId?: string;       // e.g. issuanceWorkflowId or roundId
  linkedObjectType?: string;
  notes?: string;
}
```

**Backend path:**
django-hub `ComplianceDeadline` model creation (via GraphQL mutation) →
Celery signal → `Lambda_cap_table_compliance_monitor.py`

**Response to model:** Created `deadlineId`; scheduled pre-warning and warning
dates; confirmation that email reminders will fire automatically.

---

### 3.5 `requestSignaturesViaEmail`

**Description:** Trigger an email-delivered signature request to named signers
for a document instance.

**Parameters:**
```typescript
{
  documentInstanceId: string;
  signers: Array<{
    name: string;
    email: string;
    role?: string;               // e.g. "Co-Founder", "Investor"
    signingOrder?: number;       // 1-based; omit for parallel signing
  }>;
  message?: string;              // optional cover message
  expiresInDays?: number;        // default 30
}
```

**Backend path:**
`Lambda_signature_request_create.py` → `document_ready_notification`
outbound email per signer

**Response to model:** `signaturePacketId`; list of signers queued; expected
delivery confirmation.

---

### 3.6 `inviteExternalParticipant`

**Description:** Add an ExternalDealParticipant to the active organization's deal
workspace and send them an email invite with scoped access.

**Parameters:**
```typescript
{
  participantType:
    | "Accelerator" | "VC Investor" | "Angel Investor" | "Deal Ops Team"
    | "VC Lawyer" | "Startup Lawyer" | "Accounting Firm" | "Corporate Secretary";
  organizationName: string;
  primaryContactName: string;
  primaryContactEmail: string;
  roleInDeal: string;
  accessScope:
    | "view_only" | "review_comment" | "deal_execution"
    | "legal_review" | "signature_coordination" | "admin";
  associatedRoundId?: string;
  expiresInDays?: number;        // null = no expiry
}
```

**Backend path:**
django-hub `ExternalDealParticipant` + `DealWorkspaceAccess` creation (via GraphQL) →
`external_participant_invite` outbound email

**Response to model:** Created `participantId` and `accessId`; confirmation that
invite email is queued.

---

## 4. Approval-Gate UI Pattern (`awaitingUserResponse`)

When any tool call results in an action queued with `awaitingUserResponse: true`
in `OutboundEmailTable`, the Chatbot must:

1. Return the `pendingActionId` (`requestId`) in the tool response.
2. The frontend renders a **pending confirmation card** in the chat thread showing:
   - Action type (e.g., "SAFE draft queued for [Investor Name]")
   - Key parameters summary
   - Two buttons: **Approve** and **Reject**
3. Clicking Approve/Reject calls a new backend endpoint:
   `POST /api/core/pending-actions/:requestId/resolve/` (django-hub's shared
   `/api/core/` surface -- same base URL as every other tool call, not a
   separate app-specific route)
   with `{ decision: "approved" | "rejected" }`.
4. The backend endpoint updates `OutboundEmailTable` and, if approved, invokes
   `Lambda_outboundEmailOrchestrator.py` to release the queued email.

Alternatively, the user can approve or reject by replying to the queued email
(handled by `Lambda_intentHandler.py` → `safe_review_approval` or
`signature_approval` intent). Both paths must work.

This endpoint lives in `packages/api/` as TypeScript, following workspace rules
in `CLAUDE.md`.

---

## 5. Tool Coverage Map (extends `docs/librechat-tool-calling-coverage.md`)

| Tool name | Status | SeriesAI appId | `intentHandler` intent backed |
|---|---|---|---|
| `triggerSafeDraft` | Not started | 3 + 4 | `document_generation_request` |
| `sendRoundUpdate` | Not started | 3 + 4 | `round_status_query` (outbound) |
| `queryCapTableOwnership` | Not started | 3 + 4 | `ownership_query` |
| `scheduleComplianceDeadline` | Not started | 3 + 4 | `deadline_acknowledgment` (reverse) |
| `requestSignaturesViaEmail` | Partial (existing `create_signature_request`) | 3 + 4 | `signature_approval` |
| `inviteExternalParticipant` | Not started | 3 + 4 | (django-hub signal, no intent route) |

LitigAI tools (`retrieve_case_*`, `start_motion_generation`, etc.) are unchanged
and continue to apply when `appId` is 1 or 2.

---

## 6. Testing

Follow the patterns in `api/test/` and `packages/api/` Jest test suites.

Required new tests:
- Tool input validation for all six tools (missing `organizationId`, missing required params)
- `triggerSafeDraft` → verify `pendingActionId` is returned and action is written with `awaitingUserResponse: true`
- `queryCapTableOwnership` with `includeScenarios: true` → verify scenario data is labeled non-committed
- Approval-gate endpoint → approve path releases the queued email; reject path suppresses it
- Confirm LitigAI tools are unaffected when appId is 1 or 2

---

## 7. Acceptance Criteria

- No tool call auto-commits or sends a final email without an explicit approval.
- System prompt always includes `appId`, `organizationId`, and the legal disclaimer.
- The approval-gate UI card appears for every action with `awaitingUserResponse: true`.
- Both the in-app approval button and the email-reply approval path resolve the
  same `pendingActionId` without duplication.
- All six tools are registered only for SeriesAI sessions (appId 3 and 4).
  LitigAI sessions (appId 1, 2) do not see these tools.
