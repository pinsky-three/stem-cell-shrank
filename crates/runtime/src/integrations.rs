use crate::system_api::*;

/// Concrete integration registry. Implement each provider trait here
/// with real HTTP clients, SDKs, or test stubs.
#[derive(Clone)]
pub struct AppIntegrations;

#[async_trait::async_trait]
impl AiProvider for AppIntegrations {
    async fn ai_provider_generate_code(
        &self,
        input: AiProviderGenerateCodeInput,
    ) -> Result<AiProviderGenerateCodeOutput, IntegrationError> {
        tracing::info!(
            prompt_len = input.prompt.len(),
            context_len = input.context.len(),
            "ai_provider.generate_code called (stub)"
        );

        // TODO: replace with real LLM call (OpenAI, Anthropic, etc.)
        Ok(AiProviderGenerateCodeOutput {
            generated_files:
                r#"[{"path":"src/App.tsx","content":"export default () => <h1>Hello</h1>"}]"#
                    .to_string(),
            tokens_used: 150,
        })
    }
}

#[async_trait::async_trait]
impl HostingProvider for AppIntegrations {
    async fn hosting_provider_deploy_app(
        &self,
        input: HostingProviderDeployAppInput,
    ) -> Result<HostingProviderDeployAppOutput, IntegrationError> {
        tracing::info!(
            project_ref = %input.project_ref,
            subdomain = %input.subdomain,
            "hosting_provider.deploy_app called (stub)"
        );

        // TODO: replace with real Vercel/Netlify/Cloudflare deploy call
        Ok(HostingProviderDeployAppOutput {
            url: format!("https://{}.lovable.app", input.subdomain),
            status: "live".to_string(),
        })
    }
}

#[async_trait::async_trait]
impl PaymentProvider for AppIntegrations {
    async fn payment_provider_create_subscription(
        &self,
        input: PaymentProviderCreateSubscriptionInput,
    ) -> Result<PaymentProviderCreateSubscriptionOutput, IntegrationError> {
        tracing::info!(
            plan_ref = %input.plan_ref,
            "payment_provider.create_subscription called (stub)"
        );

        // TODO: replace with real Stripe subscription call
        Ok(PaymentProviderCreateSubscriptionOutput {
            subscription_id: format!("sub_stub_{}", uuid::Uuid::new_v4()),
            status: "active".to_string(),
        })
    }
}
