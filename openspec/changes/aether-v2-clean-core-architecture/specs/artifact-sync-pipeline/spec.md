## ADDED Requirements

### Requirement: Artifact sync SHALL execute as tracked idempotent jobs
Synchronization for MCP, prompts, and skills SHALL run as jobs with persisted lifecycle states (pending, running, succeeded, failed), correlation identifiers, and retry metadata.

#### Scenario: Retry failed sync job
- **WHEN** an artifact sync job fails due to transient IO error
- **THEN** the system records failure details and can retry the same job without duplicating applied changes

#### Scenario: Idempotent re-run keeps outputs stable
- **WHEN** the same desired artifact state is synced multiple times with identical idempotency key
- **THEN** resulting projection files remain byte-equivalent and no duplicate side effects are recorded

### Requirement: Sync pipeline SHALL detect drift and conflicts
The sync process SHALL compare desired state from SQLite against current artifact state and identify drift before applying changes. Conflicts that cannot be auto-resolved SHALL be surfaced for user action.

#### Scenario: External file drift detected
- **WHEN** artifact files are modified externally between sync cycles
- **THEN** the next sync records drift and either reconciles deterministically or marks a conflict requiring explicit resolution

### Requirement: Sync pipeline SHALL provide bounded retry and latency objectives
For transient failures, the sync worker SHALL retry failed jobs up to 3 attempts with exponential backoff (1s, 2s, 4s). For successful mutations, projection updates SHALL complete within 2 seconds of the committed DB change under normal local operating conditions.

#### Scenario: Retry budget exhausted
- **WHEN** a sync job continues failing after 3 retry attempts
- **THEN** the job transitions to failed with terminal status and actionable error metadata

#### Scenario: Projection latency objective met
- **WHEN** a DB mutation changes artifact desired state
- **THEN** corresponding projection files are updated within 2 seconds and the job is marked succeeded

### Requirement: Sync events SHALL be observable and queryable
Each sync job transition SHALL emit a structured event containing correlation id, capability, old status, new status, timestamp, and error reason (when present). The system SHALL retain at least the latest 1000 sync events for local diagnostics.

#### Scenario: Failed sync has traceable event chain
- **WHEN** a sync job moves from running to failed
- **THEN** diagnostics can query the emitted transition events using the same correlation id
