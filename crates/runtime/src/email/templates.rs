pub fn verification_email(app_url: &str, token: &str) -> (String, String, String) {
    let link = format!("{app_url}/auth/verify-email?token={token}");

    let subject = "Verify your email address".to_string();

    let html = format!(
        r#"<!DOCTYPE html>
<html>
<body style="font-family: system-ui, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h2>Verify your email</h2>
  <p>Click the link below to verify your email address:</p>
  <p><a href="{link}" style="display: inline-block; padding: 12px 24px; background: #2563eb; color: #fff; text-decoration: none; border-radius: 6px;">Verify Email</a></p>
  <p style="color: #666; font-size: 14px;">Or copy this URL: {link}</p>
  <p style="color: #666; font-size: 14px;">This link expires in 24 hours.</p>
</body>
</html>"#
    );

    let text = format!(
        "Verify your email\n\nVisit this link to verify your email address:\n{link}\n\nThis link expires in 24 hours."
    );

    (subject, html, text)
}

pub fn password_reset_email(app_url: &str, token: &str) -> (String, String, String) {
    let link = format!("{app_url}/reset-password?token={token}");

    let subject = "Reset your password".to_string();

    let html = format!(
        r#"<!DOCTYPE html>
<html>
<body style="font-family: system-ui, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h2>Reset your password</h2>
  <p>Click the link below to set a new password:</p>
  <p><a href="{link}" style="display: inline-block; padding: 12px 24px; background: #2563eb; color: #fff; text-decoration: none; border-radius: 6px;">Reset Password</a></p>
  <p style="color: #666; font-size: 14px;">Or copy this URL: {link}</p>
  <p style="color: #666; font-size: 14px;">This link expires in 1 hour. If you didn't request this, ignore this email.</p>
</body>
</html>"#
    );

    let text = format!(
        "Reset your password\n\nVisit this link to set a new password:\n{link}\n\nThis link expires in 1 hour. If you didn't request this, ignore this email."
    );

    (subject, html, text)
}

pub fn welcome_email(name: &str) -> (String, String, String) {
    let subject = "Welcome!".to_string();

    let html = format!(
        r#"<!DOCTYPE html>
<html>
<body style="font-family: system-ui, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h2>Welcome, {name}!</h2>
  <p>Your email has been verified. You're all set.</p>
</body>
</html>"#
    );

    let text = format!("Welcome, {name}!\n\nYour email has been verified. You're all set.");

    (subject, html, text)
}
