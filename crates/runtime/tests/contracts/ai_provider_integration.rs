// @generated-stub
use stem_cell::system_api::*;

#[test]
fn ai_provider_generate_code_io_roundtrips() {
    let input = AiProviderGenerateCodeInput {
        prompt: "test".to_string(),
        context: "test".to_string(),
    };
    let _ = format!("{input:?}");

    let output = AiProviderGenerateCodeOutput {
        generated_files: "test".to_string(),
        tokens_used: 100,
    };
    let _ = format!("{output:?}");
}
