## ADDED Requirements

### Requirement: Projection writes SHALL be atomic with backup safeguards
All non-secret file projections (including OpenCode config and sidecar config outputs) SHALL be written atomically using temp-file-and-rename strategy. Before first write in a migration session, the system SHALL create rollback-capable backups.

#### Scenario: Atomic projection prevents partial file
- **WHEN** process interruption occurs during projection write
- **THEN** the target file remains either previous valid content or complete new content, never partial content

#### Scenario: Backup created before first migration write
- **WHEN** migration session begins and first projection write is about to execute
- **THEN** a backup snapshot is created and recorded before any target file is modified

### Requirement: Migration operations SHALL provide rollback path
Data/schema migration flows SHALL record checkpoints and backup references so a failed migration can restore the last known-good state.

#### Scenario: Failed migration triggers rollback
- **WHEN** migration step K fails after prior steps succeeded
- **THEN** the system marks migration failed and can restore state from the latest pre-migration checkpoint

### Requirement: Backup retention and restore verification SHALL be enforced
The system SHALL retain at least the latest 5 migration backup sets and SHALL verify restored state integrity before accepting mutating commands.

#### Scenario: Restore integrity gate
- **WHEN** rollback restore completes
- **THEN** schema version, required projection files, and checksum validation pass before write commands are re-enabled
