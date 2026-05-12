use anyhow::Result;
use anyhow::{Context, anyhow};
use std::fs;
use std::path::{Path, PathBuf};
use tempfile::NamedTempFile;

use crate::core::domain::ports::{ProjectionWriteRequest, ProjectionWriter};

#[derive(Debug, Default, Clone)]
pub struct AtomicProjectionWriter;

impl ProjectionWriter for AtomicProjectionWriter {
    fn write_projection(&self, request: ProjectionWriteRequest) -> Result<()> {
        let target_path = resolve_projection_target(&request.target)?;
        let parent = target_path.parent().ok_or_else(|| {
            anyhow!(
                "Projection target '{}' has no parent directory",
                target_path.display()
            )
        })?;

        fs::create_dir_all(parent).with_context(|| {
            format!(
                "Failed to create parent directory '{}' for projection target",
                parent.display()
            )
        })?;

        let mut temp_file = NamedTempFile::new_in(parent).with_context(|| {
            format!(
                "Failed to create temporary file in '{}' for projection write",
                parent.display()
            )
        })?;

        use std::io::Write;
        temp_file
            .write_all(request.content.as_bytes())
            .with_context(|| {
                format!(
                    "Failed writing projection temp content for '{}'",
                    target_path.display()
                )
            })?;
        temp_file.flush().with_context(|| {
            format!(
                "Failed flushing temporary projection file for '{}'",
                target_path.display()
            )
        })?;

        temp_file.persist(&target_path).map_err(|err| {
            anyhow!(
                "Failed atomically persisting projection file to '{}': {}",
                target_path.display(),
                err.error
            )
        })?;

        Ok(())
    }
}

fn resolve_projection_target(raw_target: &str) -> Result<PathBuf> {
    if raw_target.trim().is_empty() {
        return Err(anyhow!("Projection target path must not be empty"));
    }

    if let Some(stripped) = raw_target.strip_prefix("~/") {
        let home = std::env::var("HOME")
            .map(PathBuf::from)
            .context("HOME is not set while resolving projection target")?;
        return Ok(home.join(stripped));
    }

    let target = Path::new(raw_target);
    if target.is_absolute() {
        Ok(target.to_path_buf())
    } else {
        Err(anyhow!(
            "Projection target '{}' must be absolute or start with '~/'.",
            raw_target
        ))
    }
}
