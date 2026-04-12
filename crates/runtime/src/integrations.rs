use crate::system_api::*;

/// Concrete integration registry. Implement each provider trait here
/// with real HTTP clients, SDKs, or test stubs.
#[derive(Clone)]
pub struct AppIntegrations;

#[async_trait::async_trait]
impl PaymentProvider for AppIntegrations {
    async fn payment_provider_create_charge(
        &self,
        input: PaymentProviderCreateChargeInput,
    ) -> Result<PaymentProviderCreateChargeOutput, IntegrationError> {
        tracing::info!(
            amount_cents = input.amount_cents,
            currency = %input.currency,
            reference = %input.reference,
            "payment_provider.create_charge called (stub)"
        );

        // TODO: replace with real Stripe/payment-provider call
        Ok(PaymentProviderCreateChargeOutput {
            charge_id: format!("ch_stub_{}", uuid::Uuid::new_v4()),
            status: "succeeded".to_string(),
        })
    }
}

#[async_trait::async_trait]
impl NotificationProvider for AppIntegrations {
    async fn notification_provider_send_email(
        &self,
        input: NotificationProviderSendEmailInput,
    ) -> Result<NotificationProviderSendEmailOutput, IntegrationError> {
        tracing::info!(
            to = %input.to,
            subject = %input.subject,
            "notification_provider.send_email called (stub)"
        );

        // TODO: replace with real SMTP / SendGrid / SES call
        Ok(NotificationProviderSendEmailOutput {
            message_id: format!("msg_stub_{}", uuid::Uuid::new_v4()),
        })
    }
}
