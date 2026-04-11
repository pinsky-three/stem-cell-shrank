pub mod templates;

use lettre::message::{Mailbox, MultiPart, SinglePart, header::ContentType};
use lettre::transport::smtp::authentication::Credentials;
use lettre::{AsyncSmtpTransport, AsyncTransport, Message, Tokio1Executor};

use crate::auth::config::SmtpConfig;

#[derive(Clone)]
pub struct EmailService {
    transport: AsyncSmtpTransport<Tokio1Executor>,
    from: Mailbox,
}

impl EmailService {
    pub fn new(config: &SmtpConfig) -> Result<Self, lettre::transport::smtp::Error> {
        let creds = Credentials::new(config.username.clone(), config.password.clone());

        let transport = AsyncSmtpTransport::<Tokio1Executor>::starttls_relay(&config.host)?
            .port(config.port)
            .credentials(creds)
            .build();

        let from: Mailbox = config
            .from
            .parse()
            .expect("SMTP_FROM must be a valid email address");

        Ok(Self { transport, from })
    }

    pub async fn send(
        &self,
        to: &str,
        subject: &str,
        html_body: &str,
        text_body: &str,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let to_mailbox: Mailbox = to.parse()?;

        let message = Message::builder()
            .from(self.from.clone())
            .to(to_mailbox)
            .subject(subject)
            .multipart(
                MultiPart::alternative()
                    .singlepart(
                        SinglePart::builder()
                            .content_type(ContentType::TEXT_PLAIN)
                            .body(text_body.to_string()),
                    )
                    .singlepart(
                        SinglePart::builder()
                            .content_type(ContentType::TEXT_HTML)
                            .body(html_body.to_string()),
                    ),
            )?;

        self.transport.send(message).await?;
        Ok(())
    }

    pub async fn send_verification(
        &self,
        to: &str,
        app_url: &str,
        token: &str,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let (subject, html, text) = templates::verification_email(app_url, token);
        self.send(to, &subject, &html, &text).await
    }

    pub async fn send_password_reset(
        &self,
        to: &str,
        app_url: &str,
        token: &str,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let (subject, html, text) = templates::password_reset_email(app_url, token);
        self.send(to, &subject, &html, &text).await
    }

    pub async fn send_welcome(
        &self,
        to: &str,
        name: &str,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let (subject, html, text) = templates::welcome_email(name);
        self.send(to, &subject, &html, &text).await
    }
}
