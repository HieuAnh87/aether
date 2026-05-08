use crate::core::domain::ports::{
    EventPublisher, PersistencePort, ProjectionWriter, SecretPort, SidecarManagementPort,
};

pub mod proxy_runtime;
pub mod command_transition;

/// Aggregate of infrastructure ports used by application services.
///
/// Commands/adapters should depend on service entry points, while services
/// consume these trait-based ports.
pub struct ServicePorts<P, S, W, M, E>
where
    P: PersistencePort,
    S: SecretPort,
    W: ProjectionWriter,
    M: SidecarManagementPort,
    E: EventPublisher,
{
    pub persistence: P,
    pub secrets: S,
    pub projection_writer: W,
    pub sidecar: M,
    pub events: E,
}

impl<P, S, W, M, E> ServicePorts<P, S, W, M, E>
where
    P: PersistencePort,
    S: SecretPort,
    W: ProjectionWriter,
    M: SidecarManagementPort,
    E: EventPublisher,
{
    pub fn new(persistence: P, secrets: S, projection_writer: W, sidecar: M, events: E) -> Self {
        Self {
            persistence,
            secrets,
            projection_writer,
            sidecar,
            events,
        }
    }
}
