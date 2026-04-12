// @generated-stub
use stem_cell::system_api::*;

#[test]
fn hosting_provider_deploy_app_io_roundtrips() {
    let input = HostingProviderDeployAppInput {
        project_ref: "test".to_string(),
        subdomain: "test".to_string(),
    };
    let _ = format!("{input:?}");

    let output = HostingProviderDeployAppOutput {
        url: "test".to_string(),
        status: "test".to_string(),
    };
    let _ = format!("{output:?}");
}
