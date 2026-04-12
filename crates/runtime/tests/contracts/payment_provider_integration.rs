// @generated-stub
use stem_cell::system_api::*;

#[test]
fn payment_provider_create_subscription_io_roundtrips() {
    let input = PaymentProviderCreateSubscriptionInput {
        plan_ref: "test".to_string(),
        token: "test".to_string(),
    };
    let _ = format!("{input:?}");

    let output = PaymentProviderCreateSubscriptionOutput {
        subscription_id: "test".to_string(),
        status: "test".to_string(),
    };
    let _ = format!("{output:?}");
}
