## ADDED Requirements

### Requirement: Core runtime and domain state SHALL use SQLite as source of truth
The backend SHALL persist non-secret domain and runtime state in SQLite, including presets, provider account metadata, agent provider definitions, active routing selections, sync job records, and runtime status snapshots. File representations SHALL be treated as projections derived from SQLite state.

#### Scenario: Preset activation updates SSOT
- **WHEN** a user activates a preset through a command
- **THEN** the active preset state is committed transactionally in SQLite before any projection write occurs

#### Scenario: Runtime status persisted
- **WHEN** proxy runtime state changes (starting, running, degraded, stopped, crashed)
- **THEN** the new status is recorded in SQLite with timestamp and source metadata

### Requirement: SQLite schema SHALL support versioned migrations
The system SHALL maintain explicit schema versions and apply migrations in deterministic order at startup before accepting mutating commands.

#### Scenario: Startup applies pending migration
- **WHEN** the application starts with schema version N and bundled migrations include N+1
- **THEN** migration N+1 is applied once and schema version is updated atomically

#### Scenario: Migration failure prevents unsafe writes
- **WHEN** a migration step fails validation or execution
- **THEN** mutating commands are rejected and the failure is surfaced to observability channels
