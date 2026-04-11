use axum::extract::FromRequestParts;
use axum::http::StatusCode;
use axum::http::request::Parts;

use super::models::Account;
use super::repository;
use crate::auth::AppState;

/// Extractor that resolves the current authenticated account from the session cookie.
/// Returns 401 if no valid session is found.
pub struct CurrentAccount(pub Account);

impl FromRequestParts<AppState> for CurrentAccount {
    type Rejection = StatusCode;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        let cookies = axum_extra::extract::CookieJar::from_request_parts(parts, state)
            .await
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

        let token = cookies
            .get("session_token")
            .map(|c| c.value().to_string())
            .ok_or(StatusCode::UNAUTHORIZED)?;

        let session = repository::find_valid_session(&state.pool, &token)
            .await
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
            .ok_or(StatusCode::UNAUTHORIZED)?;

        let account = repository::find_account_by_id(&state.pool, session.account_id)
            .await
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
            .ok_or(StatusCode::UNAUTHORIZED)?;

        Ok(CurrentAccount(account))
    }
}

/// Optional variant — resolves to None instead of 401 when no session exists.
pub struct MaybeAccount(pub Option<Account>);

impl FromRequestParts<AppState> for MaybeAccount {
    type Rejection = StatusCode;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        match CurrentAccount::from_request_parts(parts, state).await {
            Ok(CurrentAccount(account)) => Ok(MaybeAccount(Some(account))),
            Err(_) => Ok(MaybeAccount(None)),
        }
    }
}
