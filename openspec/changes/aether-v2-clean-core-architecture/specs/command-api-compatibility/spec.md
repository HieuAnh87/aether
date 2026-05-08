## ADDED Requirements

### Requirement: v2 command contract SHALL be the default runtime contract
The application SHALL expose v2 command semantics as the default and only runtime contract after cutover. Legacy direct-write command behavior SHALL be removed from runtime execution paths.

#### Scenario: Legacy direct-write path unavailable
- **WHEN** a command invocation targets a removed legacy direct-write behavior
- **THEN** the runtime rejects it with a structured unsupported-operation error

### Requirement: Command responses SHALL use a structured envelope
All mutating command responses SHALL return a structured envelope containing `status`, `data` (when successful), `error` (when failed), `code`, and `correlationId`.

#### Scenario: Failed command returns actionable envelope
- **WHEN** a mutating command fails validation
- **THEN** response includes `status=error`, stable `code`, human-readable `error`, and `correlationId`

### Requirement: Breaking command changes SHALL provide explicit migration guidance
For each removed or renamed command behavior, the system SHALL provide migration guidance mapping old behavior to new v2 command semantics in project documentation and release notes.

#### Scenario: Removed behavior has migration mapping
- **WHEN** a behavior is removed during cutover
- **THEN** documentation lists replacement command flow and expected response differences
