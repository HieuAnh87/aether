# src-tauri/src/core/

Domain-driven architecture layer — clean separation of concerns.

## Layers

| Layer | Path | Purpose |
|-------|------|---------|
| Domain | `core/domain/` | Entities, value objects, port interfaces (traits) |
| Application | `core/application/` | Use cases, service implementations |
| Infrastructure | `core/infrastructure/` | Adapters, persistence, database, external integrations |

## Conventions

- Domain layer defines **what** the system does (traits/interfaces)
- Application layer implements **how** (services using domain ports)
- Infrastructure layer provides **concrete implementations** (DB, file I/O, adapters)
- Dependency direction: infrastructure → application → domain (inward)

## Notes

- Persistence uses SQLite (see `core/infrastructure/db/`)
- Adapters bridge external systems to domain ports (see `core/infrastructure/adapters/`)
