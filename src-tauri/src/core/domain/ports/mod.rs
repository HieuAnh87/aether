use std::collections::HashMap;

use anyhow::Result;

#[derive(Debug, Clone)]
pub struct PersistenceTransaction {
    pub operation: String,
    pub payload: HashMap<String, String>,
}

#[derive(Debug, Clone)]
pub struct ProjectionWriteRequest {
    pub target: String,
    pub content: String,
}

pub trait PersistencePort {
    fn execute(&self, transaction: PersistenceTransaction) -> Result<()>;
}

pub trait ProjectionWriter {
    fn write_projection(&self, request: ProjectionWriteRequest) -> Result<()>;
}
