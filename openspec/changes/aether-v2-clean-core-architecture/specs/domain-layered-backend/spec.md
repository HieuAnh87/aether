## ADDED Requirements

### Requirement: Command handlers SHALL delegate business logic to application services
Tauri command handlers SHALL act as transport adapters that validate inputs, invoke application services, and map service results to command responses. Domain rules SHALL NOT be embedded directly in command modules.

#### Scenario: Command path enforces layering
- **WHEN** a command mutates provider/account/preset state
- **THEN** the mutation occurs through an application service boundary and not via direct file or repository writes from the command handler

### Requirement: Domain services SHALL be infrastructure-agnostic
Domain services SHALL express policies for switching, validation, and orchestration using interfaces/ports, with infrastructure adapters implementing persistence, keychain, sidecar API, and filesystem interactions.

#### Scenario: Domain policy test without infrastructure
- **WHEN** a domain policy is evaluated in tests using in-memory adapters
- **THEN** the policy outcome matches production behavior without requiring filesystem or sidecar processes
