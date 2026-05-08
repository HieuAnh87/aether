## ADDED Requirements

### Requirement: Proxy lifecycle SHALL follow explicit runtime state machine
Proxy orchestration SHALL maintain explicit states including stopped, starting, running, degraded, stopping, and crashed. State transitions SHALL be validated and emitted as observable events.

#### Scenario: Crash transition is observable
- **WHEN** the sidecar proxy process exits unexpectedly while running
- **THEN** runtime state transitions to crashed and an error event is emitted with exit details when available

### Requirement: Runtime SHALL support retry and failover policy
When proxy startup or upstream routing encounters configured recoverable failures, the system SHALL apply bounded retry policy and optional failover route selection based on configured compatibility and priority.

#### Scenario: Startup retry before terminal failure
- **WHEN** proxy startup fails due to transient port bind conflict
- **THEN** the system retries according to policy and only enters terminal failed/crashed state after retry budget is exhausted

### Requirement: Runtime retry/failover policy SHALL be deterministic
Proxy startup retry SHALL use a fixed budget of 3 attempts with delays of 250ms, 500ms, and 1000ms. When failover is enabled, candidate routes SHALL be selected by: (1) protocol compatibility, (2) explicit priority value ascending, (3) stable route id lexical order.

#### Scenario: Deterministic failover selection
- **WHEN** two compatible failover routes have equal priority
- **THEN** the route with lexically smaller stable route id is selected first

### Requirement: Runtime transitions SHALL emit structured observability events
Every runtime state transition SHALL emit a structured event including previous state, next state, trigger reason, timestamp, correlation id, and process metadata when available. The system SHALL retain at least the latest 2000 runtime events.

#### Scenario: Crash transition includes diagnostics payload
- **WHEN** runtime transitions to crashed
- **THEN** the emitted event includes exit code (if available) and trigger reason for downstream diagnostics
