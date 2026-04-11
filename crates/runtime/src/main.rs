resource_model_macro::resource_model_file!("specs/self.yaml");

use std::net::SocketAddr;

use axum::routing::get;
use axum::Router;
use tower_http::cors::{Any, CorsLayer};
use tower_http::request_id::{MakeRequestUuid, PropagateRequestIdLayer, SetRequestIdLayer};
use tower_http::services::ServeDir;
use tower_http::trace::TraceLayer;
use tracing_subscriber::layer::SubscriberExt;
use tracing_subscriber::util::SubscriberInitExt;
use utoipa_scalar::{Scalar, Servable};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    tracing_subscriber::registry()
        .with(tracing_subscriber::EnvFilter::try_from_default_env().unwrap_or_else(|_| {
            "stem_cell=info,tower_http=info".into()
        }))
        .with(tracing_subscriber::fmt::layer().json())
        .init();

    let db_url = std::env::var("DATABASE_URL").expect("DATABASE_URL must be set");
    let pool = sqlx::PgPool::connect(&db_url).await?;

    migrate(&pool).await?;
    tracing::info!("migrations applied");

    let port: u16 = std::env::var("PORT")
        .unwrap_or_else(|_| "4200".into())
        .parse()
        .expect("PORT must be a valid u16");

    let serve_dir = std::env::var("SERVE_DIR").unwrap_or_else(|_| "public".into());

    let (api, openapi) = resource_api::router().split_for_parts();

    let api = api.layer(axum::middleware::from_fn(resource_api::api_key_auth));

    let cors = if let Ok(origins) = std::env::var("ALLOWED_ORIGINS") {
        let parsed: Vec<axum::http::HeaderValue> = origins
            .split(',')
            .filter_map(|o| o.trim().parse().ok())
            .collect();
        CorsLayer::new()
            .allow_origin(parsed)
            .allow_methods(Any)
            .allow_headers(Any)
    } else {
        CorsLayer::new()
            .allow_origin(Any)
            .allow_methods(Any)
            .allow_headers(Any)
    };

    let app = Router::new()
        .merge(api)
        .merge(Scalar::with_url("/api/docs", openapi))
        .route("/healthz", get(resource_api::healthz))
        .route("/readyz", get(resource_api::readyz))
        .layer(cors)
        .layer(TraceLayer::new_for_http())
        .layer(SetRequestIdLayer::x_request_id(MakeRequestUuid))
        .layer(PropagateRequestIdLayer::x_request_id())
        .fallback_service(ServeDir::new(&serve_dir))
        .with_state(pool);

    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    let listener = tokio::net::TcpListener::bind(addr).await?;
    tracing::info!(port, "listening");
    tracing::info!(port, "api docs at /api/docs");
    axum::serve(listener, app).await?;

    Ok(())
}
