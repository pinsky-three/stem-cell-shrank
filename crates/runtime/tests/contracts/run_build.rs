// @generated-stub — safe to edit; will not be overwritten if this marker is removed
use stem_cell::system_api::*;

#[test]
fn run_build_input_roundtrips_json() {
    let input = RunBuildInput {
        build_job_id: uuid::Uuid::new_v4(),
    };
    let json = serde_json::to_string(&input).unwrap();
    let decoded: RunBuildInput = serde_json::from_str(&json).unwrap();
    let _ = decoded;
}

#[test]
fn run_build_output_roundtrips_json() {
    let output = RunBuildOutput {
        artifacts_count: 1,
        tokens_used: 100,
        status: "test".to_string(),
    };
    let json = serde_json::to_string(&output).unwrap();
    let decoded: RunBuildOutput = serde_json::from_str(&json).unwrap();
    let _ = decoded;
}

#[test]
fn run_build_internal_error_converts() {
    let e = RunBuildError::Internal("oops".into());
    let se: SystemError = e.into();
    let msg = format!("{se}");
    assert!(msg.contains("internal"), "expected 'internal' in '{msg}'");
}

#[test]
fn error_build_job_not_found_converts_to_system_error() {
    let e = RunBuildError::BuildJobNotFound;
    let se: SystemError = e.into();
    let msg = format!("{se}");
    assert!(msg.contains("BuildJobNotFound"), "expected 'BuildJobNotFound' in '{msg}'");
}

#[test]
fn error_project_not_found_converts_to_system_error() {
    let e = RunBuildError::ProjectNotFound;
    let se: SystemError = e.into();
    let msg = format!("{se}");
    assert!(msg.contains("ProjectNotFound"), "expected 'ProjectNotFound' in '{msg}'");
}

#[test]
fn error_ai_provider_error_converts_to_system_error() {
    let e = RunBuildError::AiProviderError("test".into());
    let se: SystemError = e.into();
    let msg = format!("{se}");
    assert!(msg.contains("AiProviderError"), "expected 'AiProviderError' in '{msg}'");
}

#[test]
fn error_build_failed_converts_to_system_error() {
    let e = RunBuildError::BuildFailed("test".into());
    let se: SystemError = e.into();
    let msg = format!("{se}");
    assert!(msg.contains("BuildFailed"), "expected 'BuildFailed' in '{msg}'");
}
