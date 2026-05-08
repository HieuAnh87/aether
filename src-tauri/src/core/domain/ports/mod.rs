use std::collections::HashMap;

use anyhow::Result;

#[derive(Debug, Clone)]
pub struct PersistenceTransaction {
    pub operation: String,
    pub payload: HashMap<String, String>,
}

#[derive(Debug, Clone)]
pub struct SecretReference {
    pub account_id: String,
    pub provider: String,
}

#[derive(Debug, Clone)]
pub struct ProjectionWriteRequest {
    pub target: String,
    pub content: String,
}

#[derive(Debug, Clone)]
pub struct SidecarCommand {
    pub name: String,
    pub params: HashMap<String, String>,
}

#[derive(Debug, Clone)]
pub struct DomainEvent {
    pub event_type: String,
    pub correlation_id: String,
    pub fields: HashMap<String, String>,
}

pub trait PersistencePort {
    fn execute(&self, transaction: PersistenceTransaction) -> Result<()>;
}

pub trait SecretPort {
    fn read_secret(&self, reference: &SecretReference) -> Result<Option<String>>;
    fn write_secret(&self, reference: &SecretReference, value: &str) -> Result<()>;
    fn delete_secret(&self, reference: &SecretReference) -> Result<()>;
}

pub trait ProjectionWriter {
    fn write_projection(&self, request: ProjectionWriteRequest) -> Result<()>;
}

pub trait SidecarManagementPort {
    fn execute_command(&self, command: SidecarCommand) -> Result<()>;
}

pub trait EventPublisher {
    fn publish(&self, event: DomainEvent) -> Result<()>;
}
