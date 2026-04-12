use crate::system_api::*;
use sqlx::Row;

#[async_trait::async_trait]
impl RunBuildSystem for super::AppSystems {
    async fn execute(
        &self,
        pool: &sqlx::PgPool,
        input: RunBuildInput,
    ) -> Result<RunBuildOutput, RunBuildError> {
        let span = tracing::info_span!("run_build", build_job_id = %input.build_job_id);
        let _enter = span.enter();

        // Load build job
        let build_row = sqlx::query(
            "SELECT id, status, prompt_summary, model, project_id, message_id \
             FROM build_jobs WHERE id = $1 AND deleted_at IS NULL",
        )
        .bind(input.build_job_id)
        .fetch_optional(pool)
        .await
        .map_err(|e: sqlx::Error| RunBuildError::BuildFailed(e.to_string()))?
        .ok_or(RunBuildError::BuildJobNotFound)?;

        let project_id: uuid::Uuid = build_row.get("project_id");
        let build_id: uuid::Uuid = build_row.get("id");
        let prompt: String = build_row.get("prompt_summary");

        // Load project
        let project_row = sqlx::query(
            "SELECT id, slug, org_id FROM projects WHERE id = $1 AND deleted_at IS NULL",
        )
        .bind(project_id)
        .fetch_optional(pool)
        .await
        .map_err(|e: sqlx::Error| RunBuildError::BuildFailed(e.to_string()))?
        .ok_or(RunBuildError::ProjectNotFound)?;

        let org_id: uuid::Uuid = project_row.get("org_id");
        let started = std::time::Instant::now();

        // Mark as running
        sqlx::query("UPDATE build_jobs SET status = 'running', updated_at = NOW() WHERE id = $1")
            .bind(build_id)
            .execute(pool)
            .await
            .map_err(|e: sqlx::Error| RunBuildError::BuildFailed(e.to_string()))?;

        // Gather existing artifact paths as context
        let existing_rows = sqlx::query(
            "SELECT file_path FROM artifacts \
             WHERE project_id = $1 AND deleted_at IS NULL \
             ORDER BY created_at DESC LIMIT 50",
        )
        .bind(project_id)
        .fetch_all(pool)
        .await
        .map_err(|e: sqlx::Error| RunBuildError::BuildFailed(e.to_string()))?;

        let context = existing_rows
            .iter()
            .map(|r| r.get::<String, _>("file_path"))
            .collect::<Vec<_>>()
            .join(", ");

        // Call AI provider
        let ai_result = crate::integrations::AppIntegrations
            .ai_provider_generate_code(AiProviderGenerateCodeInput {
                prompt: prompt.clone(),
                context,
            })
            .await
            .map_err(|e| RunBuildError::AiProviderError(format!("{e:?}")))?;

        // Parse generated files (expect JSON array of {path, content})
        let files: Vec<GeneratedFile> =
            serde_json::from_str(&ai_result.generated_files).unwrap_or_default();

        let mut artifacts_count: i32 = 0;
        for file in &files {
            let hash = format!("{:x}", fnv_hash(file.content.as_bytes()));
            let size = file.content.len() as i64;
            let lang = detect_language(&file.path);

            sqlx::query(
                "INSERT INTO artifacts \
                     (id, file_path, content_hash, size_bytes, language, \
                      build_job_id, project_id, created_at, updated_at) \
                 VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())",
            )
            .bind(uuid::Uuid::new_v4())
            .bind(&file.path)
            .bind(&hash)
            .bind(size)
            .bind(lang.as_deref())
            .bind(build_id)
            .bind(project_id)
            .execute(pool)
            .await
            .map_err(|e: sqlx::Error| RunBuildError::BuildFailed(e.to_string()))?;

            artifacts_count += 1;
        }

        let duration_ms = started.elapsed().as_millis() as i64;

        // Mark build as succeeded
        sqlx::query(
            "UPDATE build_jobs \
             SET status = 'succeeded', tokens_used = $2, duration_ms = $3, updated_at = NOW() \
             WHERE id = $1",
        )
        .bind(build_id)
        .bind(ai_result.tokens_used)
        .bind(duration_ms)
        .execute(pool)
        .await
        .map_err(|e: sqlx::Error| RunBuildError::BuildFailed(e.to_string()))?;

        // Record usage for billing
        sqlx::query(
            "INSERT INTO usage_records \
                 (id, kind, quantity, description, org_id, project_id, created_at, updated_at) \
             VALUES ($1, 'build', $2, $3, $4, $5, NOW(), NOW())",
        )
        .bind(uuid::Uuid::new_v4())
        .bind(ai_result.tokens_used)
        .bind(format!(
            "Build job {} — {} artifacts",
            build_id, artifacts_count
        ))
        .bind(org_id)
        .bind(project_id)
        .execute(pool)
        .await
        .map_err(|e: sqlx::Error| RunBuildError::BuildFailed(e.to_string()))?;

        tracing::info!(
            artifacts_count,
            tokens_used = ai_result.tokens_used,
            duration_ms,
            "build completed"
        );

        Ok(RunBuildOutput {
            artifacts_count,
            tokens_used: ai_result.tokens_used,
            status: "succeeded".to_string(),
        })
    }
}

#[derive(serde::Deserialize)]
struct GeneratedFile {
    path: String,
    content: String,
}

/// FNV-1a inspired content fingerprint (replace with SHA-256 in production)
fn fnv_hash(data: &[u8]) -> u128 {
    let mut hash: u128 = 0x6c62272e07bb0142_62b821756295c58d;
    for &byte in data {
        hash ^= byte as u128;
        hash = hash.wrapping_mul(0x0000000001000000_000000000000013B);
    }
    hash
}

fn detect_language(path: &str) -> Option<String> {
    let ext = path.rsplit('.').next()?;
    match ext {
        "ts" | "tsx" => Some("typescript".into()),
        "js" | "jsx" => Some("javascript".into()),
        "rs" => Some("rust".into()),
        "py" => Some("python".into()),
        "css" => Some("css".into()),
        "html" => Some("html".into()),
        "json" => Some("json".into()),
        "yaml" | "yml" => Some("yaml".into()),
        "md" => Some("markdown".into()),
        "sql" => Some("sql".into()),
        "toml" => Some("toml".into()),
        _ => None,
    }
}
