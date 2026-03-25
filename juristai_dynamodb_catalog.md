# JuristAI DynamoDB data model catalog

_Generated from console snapshots pasted on 2026-03-25._

## How to read this

- Attribute inventories are based on observed scan columns and sample items, not exhaustive schema enforcement.
- Keys are high-confidence where the console visibly showed a sort-key query field; otherwise they are inferred and should be confirmed once directly in table details.
- Many fields are optional/null in observed data; DynamoDB itself does not enforce a fixed schema.

## Domain map

- **case-workflow**: `actionItems`, `CaseImportantDatesTable`, `MotionTable`
- **case-core**: `CaseTable`, `caseThreadTable`, `DocketEntryTable`
- **email-ingestion**: `EmailAttachment`, `EmailIntegration`, `EmailIntegrationOAuthState`, `EmailMessage`, `IngestionRun`
- **case-files**: `FileTable`
- **identity-access**: `LegalTeamInviteTable`, `LegalTeamTable`, `UserAppAccessTable`, `UserTable`
- **email-outbound**: `OutboundEmailTable`
- **billing**: `PricingStrategyTable`, `SubscriptionTable`

## Cross-table relationships

- `CaseTable.caseId` is the central foreign key for case-linked tables: `DocketEntryTable`, `FileTable`, `caseThreadTable`, `MotionTable`, `actionItems`, `CaseImportantDatesTable`, `EmailMessage`, and `OutboundEmailTable`.
- `UserTable.userId` links to ownership/access/workflow tables: `UserAppAccessTable`, `caseThreadTable`, `MotionTable`, `actionItems`, `CaseImportantDatesTable`, `EmailIntegration`, `OutboundEmailTable`, `SubscriptionTable`.
- `EmailIntegration.integrationId` is the parent for `EmailMessage`, `EmailAttachment`, and `IngestionRun`.
- `DocketEntryTable.docketEntryId` links to `FileTable`, `actionItems`, and `CaseImportantDatesTable` where present.
- `LegalTeamTable.legalTeamId` is referenced by `LegalTeamInviteTable` and `UserTable.legalTeamIds`.

## `actionItems`

**Purpose:** Action items / recommended next steps attached to a case.

**Key schema:**

- Partition key: `itemId`
- Sort key: none observed
- Confidence: inferred from console layout

**GSIs:** `caseId-index`

**Observed attributes:**

- `itemId`: string
- `caseId`: string
- `appId`: string | null
- `assistantExcerpt`: string | null
- `assistantRunId`: string | null
- `completed`: boolean
- `completionCheckedAt`: string(timestamp) | null
- `completionReason`: string | null
- `contextHash`: string | null
- `createdAt`: string(timestamp)
- `date`: string(timestamp/date)
- `description`: string
- `docketEntryId`: string | null
- `entryNumber`: number | null
- `lastUpdatedBy`: string | null
- `lastUpdatedSource`: string | null
- `origin`: string
- `priority`: string
- `rank`: number
- `rawEntry`: map/json blob
- `signature`: string
- `source`: string
- `status`: string
- `suggestedDueDate`: string(date) | null
- `title`: string
- `updatedAt`: string(timestamp)
- `userId`: string

**Likely relations:**

- caseId -> CaseTable.caseId
- docketEntryId -> DocketEntryTable.docketEntryId
- userId -> UserTable.userId

**Notes:**

- Stores assistant-generated tasks such as discovery steps or motion ideas.
- Contains both normalized fields and a rawEntry blob for original structured output.

## `CaseImportantDatesTable`

**Purpose:** Deadlines, warnings, invitations, and completion tracking for case-important dates.

**Key schema:**

- Partition key: `caseId (likely) or deadlineId`
- Sort key: none observed
- Confidence: ambiguous from pasted console; deadlineId is unique-looking

**GSIs:** `caseId-index`, `date-index`

**Observed attributes:**

- `caseId`: string
- `deadlineId`: string
- `appId`: string | null
- `assignedUserIds`: list[string]
- `assistantExcerpt`: string | null
- `assistantRunId`: string | null
- `completed`: boolean
- `completionAssistantResponse`: string | null
- `completionAssistantRunId`: string | null
- `completionCheckedAt`: string(timestamp) | null
- `completionReason`: string | null
- `contextHash`: string | null
- `createdAt`: string(timestamp)
- `date`: string(date)
- `docketEntryId`: string | null
- `entryNumber`: number | null
- `inviteAudit`: map/json blob | null
- `invitedEmails`: list[string]
- `invitedUserIds`: list[string]
- `label`: string
- `lastEvaluatedAt`: number | string | null
- `lastEvaluatedEvent`: map/json blob | null
- `lastEvaluatedISO`: string(timestamp) | null
- `lastInviteMessageIds`: list[string] | null
- `lastInviteRecipients`: list[string] | null
- `lastInviteSentAt`: string(timestamp) | null
- `lastInviteSignature`: string | null
- `lastWarningCheckAt`: string(timestamp) | null
- `notes`: string | null
- `pastDueCompletionCheckFailedAt`: string(timestamp) | null
- `practiceArea`: string | null
- `pre_warning_sent`: boolean | null
- `previousStatus`: string | null
- `preWarningCompletionCheckFailedAt`: string(timestamp) | null
- `preWarningEmailMessageId`: string | null
- `preWarningMessage`: string | null
- `preWarningSentAt`: string(timestamp) | null
- `preWarningSqsMessageId`: string | null
- `rawEntry`: map/json blob
- `signature`: string
- `source`: string
- `status`: string
- `updatedAt`: string(timestamp)
- `userId`: string
- `warning_sent`: boolean | null
- `warningAssistantResponse`: string | null
- `warningAssistantRunId`: string | null
- `warningEmailMessageId`: string | null
- `warningErrors`: map/json blob | list | null
- `warningMessage`: string | null
- `warningSentAt`: string(timestamp) | null
- `warningSqsMessageId`: string | null
- `warningSummary`: string | null
- `weeklyNewsletterExecutionArn`: string | null

**Likely relations:**

- caseId -> CaseTable.caseId
- docketEntryId -> DocketEntryTable.docketEntryId
- userId -> UserTable.userId

**Notes:**

- This is more than a pure deadlines table; it also captures evaluation/warning pipeline state.
- The date-index likely supports upcoming/past-due queries by date.

## `CaseTable`

**Purpose:** Top-level case record with docket metadata and stage classification.

**Key schema:**

- Partition key: `caseId`
- Sort key: none observed
- Confidence: inferred from console layout

**GSIs:** `caseId-index`

**Observed attributes:**

- `caseId`: string
- `appId`: string
- `assignedTo`: string | list[string] | null
- `caseName`: string
- `courtId`: string
- `currentStage`: string
- `dateFiled`: string(timestamp/date)
- `dateLastFiling`: string(timestamp/date) | null
- `dateTerminated`: string(timestamp/date) | null
- `docketNumber`: string
- `numberOfDocuments`: number
- `numDocketEntries`: number
- `practiceArea`: string | null
- `stageConfidence`: number
- `stageDiscrepancy`: boolean
- `stageEvidenceIds`: list[string]
- `stageReason`: string
- `stageSource`: string
- `stageUpdatedAt`: string(timestamp)
- `summaryS3Url`: string(url) | null

**Likely relations:**

- caseId is the central foreign key across most case-related tables

**Notes:**

- Holds derived litigation stage plus confidence/reasoning.
- summaryS3Url points to a case summary text object in S3.

## `caseThreadTable`

**Purpose:** Case/user thread registry for assistant conversations.

**Key schema:**

- Partition key: `threadId`
- Sort key: none observed
- Confidence: inferred from console layout

**GSIs:** `caseId-index`, `threadName-index`

**Observed attributes:**

- `threadId`: string
- `userId`: string
- `appId`: string | number | null
- `caseId`: string
- `conversationId`: string
- `createdAt`: number(epoch) | string(timestamp)
- `documentType`: string | null
- `promptId`: string | null
- `role`: string
- `scopeId`: string | null
- `scopeType`: string | null
- `threadName`: string
- `threadType`: string

**Likely relations:**

- caseId -> CaseTable.caseId
- userId -> UserTable.userId

**Notes:**

- Looks like the canonical registry for per-case assistant thread types (docSum, generator, etc.).
- threadName appears to encode userId_caseId_threadType in some records.

## `DocketEntryTable`

**Purpose:** Normalized docket entry records per case.

**Key schema:**

- Partition key: `docketEntryId`
- Sort key: none observed
- Confidence: inferred from console layout

**GSIs:** `caseId-index`

**Observed attributes:**

- `docketEntryId`: string
- `caseId`: string
- `classification`: string | null
- `dateEntered`: string(timestamp)
- `dateFiled`: string(timestamp/date)
- `description`: string
- `documentExists`: boolean | number
- `entryNumber`: number
- `pacerSequenceNumber`: number
- `resourceUri`: string(url)
- `stage`: string | null
- `summaryS3Url`: string(url) | null

**Likely relations:**

- caseId -> CaseTable.caseId
- docketEntryId -> FileTable.docketEntryId / actionItems.docketEntryId / CaseImportantDatesTable.docketEntryId

**Notes:**

- documentExists is observed as 1 in a sample item; code should tolerate bool-or-int representation.

## `EmailAttachment`

**Purpose:** Stored email attachment metadata and object locations.

**Key schema:**

- Partition key: `integrationId`
- Sort key: `attachmentId`
- Confidence: high (console showed sort key input)

**GSIs:** none observed

**Observed attributes:**

- `integrationId`: string
- `attachmentId`: string
- `caseId`: string | null
- `createdAt`: string(timestamp)
- `fileName`: string
- `ingestStatus`: string
- `mimeType`: string
- `ocrBucket`: string | null
- `ocrKey`: string | null
- `originalBucket`: string
- `originalKey`: string
- `providerAttachmentId`: string
- `providerMessageId`: string
- `s3Bucket`: string
- `s3Key`: string
- `sha256`: string
- `sizeBytes`: number

**Likely relations:**

- integrationId -> EmailIntegration.integrationId
- providerMessageId -> EmailMessage.providerMessageId or message record

**Notes:**

- Stores both original and OCR object pointers.

## `EmailIntegration`

**Purpose:** Per-user email connector configuration and sync status.

**Key schema:**

- Partition key: `integrationId`
- Sort key: `userId`
- Confidence: moderate (console showed sort key input; ordering suggests this pair)

**GSIs:** `status-provider-index`, `userId-index`

**Observed attributes:**

- `integrationId`: string
- `userId`: string
- `appId`: string | number | null
- `config`: map/json blob
- `createdAt`: string(timestamp)
- `emailAddress`: string(email)
- `errorAt`: string(timestamp) | null
- `errorCode`: string | null
- `errorMessage`: string | null
- `lastSuccessfulRunId`: string | null
- `lastSyncAt`: string(timestamp) | null
- `lastSyncCursor`: string | null
- `provider`: string
- `refreshTokenSecretRef`: string(arn)
- `status`: string
- `updatedAt`: string(timestamp)

**Likely relations:**

- userId -> UserTable.userId
- integrationId -> EmailMessage / EmailAttachment / IngestionRun

**Notes:**

- config sample contains folderScope and maxLookbackDaysOnReset.
- status/provider index likely supports active connector workers.

## `EmailIntegrationOAuthState`

**Purpose:** Temporary OAuth PKCE/state tracking during email connector setup.

**Key schema:**

- Partition key: `state`
- Sort key: none observed
- Confidence: inferred from console layout

**GSIs:** none observed

**Observed attributes:**

- `state`: string
- `appId`: string | number | null
- `codeVerifier`: string
- `createdAt`: string(timestamp)
- `expiresAt`: number(epoch) | string(timestamp)
- `provider`: string | null
- `userId`: string

**Likely relations:**

- userId -> UserTable.userId

**Notes:**

- Ephemeral table; records should expire or be cleaned up after auth completion.

## `EmailMessage`

**Purpose:** Normalized inbound email metadata plus case-matching scores.

**Key schema:**

- Partition key: `integrationId`
- Sort key: `messageId`
- Confidence: high (console showed sort key input)

**GSIs:** none observed

**Observed attributes:**

- `integrationId`: string
- `messageId`: string
- `bcc`: list[recipient]
- `caseId`: string | null
- `caseIds`: list[string]
- `cc`: list[recipient]
- `createdAt`: string(timestamp)
- `decision`: string
- `dedupeKey`: string
- `dedupeKeyPrimary`: string | null
- `dedupeKeySecondary`: string | null
- `finalScoreByCase`: map[caseId -> score/reasons/matchedBy]
- `from`: recipient
- `ingestStatus`: string
- `internetMessageId`: string
- `matchConfidence`: number
- `matchedBy`: list[string]
- `matchReasons`: list[string]
- `matchScoreByCase`: map[caseId -> number]
- `prefetchScoreByCase`: map[caseId -> score/reasons/matchedBy]
- `providerMessageId`: string
- `providerThreadId`: string
- `receivedAt`: string(timestamp)
- `snippet`: string
- `subject`: string
- `to`: list[recipient]
- `updatedAt`: string(timestamp)

**Likely relations:**

- integrationId -> EmailIntegration.integrationId
- caseId / caseIds -> CaseTable.caseId

**Notes:**

- Recipient objects are nested maps with name/address.
- Stores both prefetch and final scoring by case.

## `FileTable`

**Purpose:** Case/docket file registry and RAG ingestion metadata.

**Key schema:**

- Partition key: `fileId`
- Sort key: none observed
- Confidence: inferred from console layout

**GSIs:** `docketEntryId-index`, `docketId-index`

**Observed attributes:**

- `fileId`: string
- `docketEntryId`: string | null
- `createdAt`: string(timestamp)
- `docketId`: string | null
- `documentHint`: string | null
- `indexed_at`: string(timestamp) | null
- `isAvailable`: boolean | null
- `lastUpdated`: string(timestamp) | null
- `missingUploadRequestedAt`: string(timestamp) | null
- `missingUploadRequestSource`: string | null
- `originalUrl`: string(url) | null
- `rag_chunks`: number | null
- `rag_status`: string | null
- `s3Url`: string(url) | null
- `source`: string
- `updatedAt`: string(timestamp)

**Likely relations:**

- docketEntryId -> DocketEntryTable.docketEntryId

**Notes:**

- Handles both docket-derived files and manually uploaded/user_text artifacts.

## `IngestionRun`

**Purpose:** Run log for connector ingestion jobs.

**Key schema:**

- Partition key: `integrationId`
- Sort key: `runId`
- Confidence: high (console showed sort key input)

**GSIs:** none observed

**Observed attributes:**

- `integrationId`: string
- `runId`: string
- `cursorBefore`: string | null
- `startedAt`: string(timestamp)
- `status`: string

**Likely relations:**

- integrationId -> EmailIntegration.integrationId

**Notes:**

- Useful for diagnosing connector sync state and reruns.

## `LegalTeamInviteTable`

**Purpose:** Pending invites into legal teams.

**Key schema:**

- Partition key: `inviteId`
- Sort key: none observed
- Confidence: inferred from console layout

**GSIs:** `legal-team-invite-email-index`, `legalTeamId-index`

**Observed attributes:**

- `inviteId`: string
- `appId`: string | number | null
- `createdAt`: string(timestamp)
- `email`: string(email)
- `expiresAt`: string(timestamp)
- `legalTeamId`: string

**Likely relations:**

- legalTeamId -> LegalTeamTable.legalTeamId

## `LegalTeamTable`

**Purpose:** Legal team master records.

**Key schema:**

- Partition key: `legalTeamId`
- Sort key: none observed
- Confidence: inferred from console layout

**GSIs:** none observed

**Observed attributes:**

- `legalTeamId`: string
- `appId`: string
- `legalTeamName`: string
- `userIds`: list[string]

**Likely relations:**

- userIds[] -> UserTable.userId

## `MotionTable`

**Purpose:** Generated motion artifacts and their output locations.

**Key schema:**

- Partition key: `motionId`
- Sort key: `caseId`
- Confidence: moderate (console showed sort key input; ordering suggests this pair)

**GSIs:** `userId-caseId-index`

**Observed attributes:**

- `motionId`: string
- `caseId`: string
- `appId`: string | number | null
- `citationsRequested`: boolean | null
- `citationsValidated`: boolean | null
- `documentKind`: string | null
- `draftKey`: string | null
- `fileName`: string | null
- `finalBucket`: string | null
- `finalKey`: string | null
- `finalUrl`: string(url) | null
- `motion_length`: number | string | null
- `S3Url`: string(url) | null
- `stage`: string
- `templateKey`: string | null
- `timestamp`: number(epoch) | string(timestamp)
- `userId`: string

**Likely relations:**

- caseId -> CaseTable.caseId
- userId -> UserTable.userId

**Notes:**

- Observed record uses stage='1. Generated'.

## `OutboundEmailTable`

**Purpose:** Outbound assistant email queue / history / delivery state.

**Key schema:**

- Partition key: `requestId (likely) or composite with userId`
- Sort key: `unknown`
- Confidence: ambiguous from pasted console; userId and requestId are both leading fields

**GSIs:** `dedupeKey-index`

**Observed attributes:**

- `userId`: string
- `requestId`: string
- `awaitingQuestions`: list | map | null
- `awaitingUserResponse`: boolean | null
- `caseId`: string | null
- `context`: map/json blob
- `decisionReason`: string
- `dedupeKey`: string
- `emailType`: string
- `eventProfile`: map/json blob
- `eventSource`: string
- `lastAssistantAckAt`: string(timestamp) | null
- `lastDeliveredMessageId`: string | null
- `policyDecision`: string | null
- `policyFollowed`: boolean | null
- `scheduledAt`: string(timestamp) | null
- `status`: string
- `subject`: string
- `template`: string
- `threadRootMessageId`: string | null
- `to`: string | list[string]
- `updatedAt`: string(timestamp)

**Likely relations:**

- userId -> UserTable.userId
- caseId -> CaseTable.caseId

**Notes:**

- Looks like a durable log/queue for assistant-generated outbound email.
- Primary key should be confirmed directly in console before codegen.

## `PricingStrategyTable`

**Purpose:** Pricing strategies and tier definitions.

**Key schema:**

- Partition key: `pricingStrategyId`
- Sort key: none observed
- Confidence: inferred from console layout

**GSIs:** none observed

**Observed attributes:**

- `pricingStrategyId`: string
- `appId`: string | number | null
- `strategyType`: string
- `stripeLookup`: string
- `tiers`: list[map]

**Likely relations:**

- pricingStrategyId -> SubscriptionTable.pricingStrategyId

## `SubscriptionTable`

**Purpose:** User/org subscriptions to app pricing plans.

**Key schema:**

- Partition key: `subsId`
- Sort key: none observed
- Confidence: inferred from console layout

**GSIs:** none observed

**Observed attributes:**

- `subsId`: string
- `AmountCharged`: string | number | empty
- `appId`: string | number | null
- `endDate`: string(timestamp/date)
- `organizationId`: string | empty | null
- `pricingStrategyId`: string
- `pricingTier`: string
- `startDate`: string(timestamp/date)
- `userId`: string

**Likely relations:**

- userId -> UserTable.userId
- pricingStrategyId -> PricingStrategyTable.pricingStrategyId

## `UserAppAccessTable`

**Purpose:** Per-user authorization and lifecycle state per app.

**Key schema:**

- Partition key: `userAppAccessId`
- Sort key: none observed
- Confidence: inferred from console layout

**GSIs:** `userId-index`, `userId-appId-index`

**Observed attributes:**

- `userAppAccessId`: string
- `userId`: string
- `accessLevel`: string
- `appId`: string | number
- `emailLinked`: boolean | null
- `expirationDate`: string(timestamp/date)
- `grantedDate`: string(timestamp/date)
- `lawsuitRecommend`: boolean | null
- `LitigAIStage`: string | null

**Likely relations:**

- userId -> UserTable.userId

## `UserTable`

**Purpose:** Primary user records and assigned case/thread pointers.

**Key schema:**

- Partition key: `userId`
- Sort key: none observed
- Confidence: inferred from console layout

**GSIs:** `emailId-index`, `organizationId-index`, `userId-index`

**Observed attributes:**

- `userId`: string
- `organizationId`: string
- `accountThreadId`: string | null
- `assignedCases`: set[string] | list[string]
- `contextCrusherThreadId`: string | null
- `createdDate`: string(timestamp/date)
- `email`: string(email)
- `firstName`: string
- `lastName`: string
- `legalTeamIds`: list[string]
- `username`: string

**Likely relations:**

- assignedCases[] -> CaseTable.caseId
- legalTeamIds[] -> LegalTeamTable.legalTeamId

**Notes:**

- assignedCases was observed in set-like rendering (`{"a6nkn3i"}`).

## Recommended repo layout

- `docs/data-model/dynamodb.md` — human-readable catalog.
- `docs/data-model/dynamodb.schema.json` — machine-readable manifest for codegen, validation, or tests.
- Add a lightweight check in CI that compares this manifest to table details exported from AWS and fails on drift.
