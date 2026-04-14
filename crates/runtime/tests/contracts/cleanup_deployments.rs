// @generated-stub — safe to edit; will not be overwritten if this marker is removed
use stem_cell::system_api::*;

#[test]
fn cleanup_deployments_input_roundtrips_json() {
    let input = CleanupDeploymentsInput {
        max_age_minutes: Some(1),
        deployment_id: Some(uuid::Uuid::new_v4()),
    };
    let json = serde_json::to_string(&input).unwrap();
    let decoded: CleanupDeploymentsInput = serde_json::from_str(&json).unwrap();
    let _ = decoded;
}

#[test]
fn cleanup_deployments_output_roundtrips_json() {
    let output = CleanupDeploymentsOutput {
        cleaned_count: 1,
        errors: "test".to_string(),
        status: "test".to_string(),
    };
    let json = serde_json::to_string(&output).unwrap();
    let decoded: CleanupDeploymentsOutput = serde_json::from_str(&json).unwrap();
    let _ = decoded;
}

#[test]
fn cleanup_deployments_internal_error_converts() {
    let e = CleanupDeploymentsError::Internal("oops".into());
    let se: SystemError = e.into();
    let msg = format!("{se}");
    assert!(msg.contains("internal"), "expected 'internal' in '{msg}'");
}

#[test]
fn error_deployment_not_found_converts_to_system_error() {
    let e = CleanupDeploymentsError::DeploymentNotFound;
    let se: SystemError = e.into();
    let msg = format!("{se}");
    assert!(msg.contains("DeploymentNotFound"), "expected 'DeploymentNotFound' in '{msg}'");
}

#[test]
fn error_cleanup_failed_converts_to_system_error() {
    let e = CleanupDeploymentsError::CleanupFailed("test".into());
    let se: SystemError = e.into();
    let msg = format!("{se}");
    assert!(msg.contains("CleanupFailed"), "expected 'CleanupFailed' in '{msg}'");
}

#[test]
fn error_database_error_converts_to_system_error() {
    let e = CleanupDeploymentsError::DatabaseError("test".into());
    let se: SystemError = e.into();
    let msg = format!("{se}");
    assert!(msg.contains("DatabaseError"), "expected 'DatabaseError' in '{msg}'");
}
