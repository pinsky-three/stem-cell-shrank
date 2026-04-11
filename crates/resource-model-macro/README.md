# resource-model-macro

A Rust proc-macro that generates complete CRUD data layers from a YAML spec — structs, SQL migrations, repository traits with [sqlx](https://github.com/launchbadge/sqlx) implementations, and optionally a REST API via [Axum](https://github.com/tokio-rs/axum) + [utoipa](https://github.com/juhaku/utoipa).

Define your data model once. Get a fully-typed Postgres backend at compile time.

## Quick start

```toml
# Cargo.toml
[dependencies]
resource-model-macro = "0.1"

# peer dependencies (used by generated code)
sqlx = { version = "0.8", features = ["runtime-tokio", "tls-rustls", "postgres", "uuid"] }
uuid = { version = "1", features = ["v4", "serde"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
async-trait = "0.1"
tokio = { version = "1", features = ["full"] }

# only needed when config.api = true
axum = "0.8"
utoipa = { version = "5", features = ["uuid"] }
utoipa-axum = "0.2"
```

## Usage

### Inline YAML

```rust
resource_model_macro::resource_model!(r#"
version: 1
config:
  visibility: "pub"
  backend: "postgres"
entities:
  - name: "User"
    table: "users"
    id: { name: "id", type: "uuid" }
    fields:
      - { name: "name", type: "string", required: true }
      - { name: "email", type: "string", required: true, unique: true }
relations: []
"#);
```

### From a YAML file

```rust
resource_model_macro::resource_model_file!("specs/my-model.yaml");
```

The path is relative to the crate root (`CARGO_MANIFEST_DIR`).

## What gets generated

For each entity in the spec the macro expands to:

| Generated item | Description |
|---|---|
| `struct User` | Row type with `sqlx::FromRow`, `Serialize`, `Deserialize` (and `ToSchema` when `api: true`) |
| `struct CreateUser` | Input type for inserts (no `id` field) |
| `struct UpdateUser` | Partial-update type (all fields `Option<T>`, uses `COALESCE` in SQL) |
| `trait UserRepository` | Extends `CrudRepository` with relation accessors |
| `struct SqlxUserRepository` | Concrete implementation backed by `sqlx::PgPool` |
| `async fn migrate(pool)` | Drops and recreates all tables in dependency order |

When `config.api` is `true`, a `resource_api` module is also generated containing:

- Axum handler functions for each CRUD endpoint and relation
- OpenAPI metadata via `utoipa::path` attributes
- `resource_api::router() -> OpenApiRouter<PgPool>` to mount everything

## YAML spec format

```yaml
version: 1                # must be 1

config:
  visibility: "pub"       # "pub", "pub(crate)", or ""
  backend: "postgres"     # only "postgres" supported today
  api: true               # optional, generates REST API module

entities:
  - name: "Organization"
    table: "organizations"
    id: { name: "id", type: "uuid" }
    fields:
      - { name: "name",   type: "string", required: true }
      - { name: "slug",   type: "string", required: true, unique: true }
      - { name: "active", type: "bool",   required: true }

  - name: "User"
    table: "users"
    id: { name: "id", type: "uuid" }
    fields:
      - { name: "name",  type: "string", required: true }
      - { name: "email", type: "string", required: true, unique: true }
      - name: "org_id"
        type: "uuid"
        required: true
        references: { entity: "Organization", field: "id" }

relations:
  - { name: "members", kind: "has_many",    source: "Organization", target: "User", foreign_key: "org_id" }
  - { name: "org",     kind: "belongs_to",  source: "User",         target: "Organization", foreign_key: "org_id" }
```

### Supported field types

| YAML type | Rust type | SQL type |
|---|---|---|
| `uuid` | `uuid::Uuid` | `UUID` |
| `string` | `String` | `TEXT` |
| `text` | `String` | `TEXT` |
| `int` | `i32` | `INTEGER` |
| `bigint` | `i64` | `BIGINT` |
| `float` | `f64` | `DOUBLE PRECISION` |
| `bool` | `bool` | `BOOLEAN` |

### Relation kinds

| Kind | Direction | Generated method returns |
|---|---|---|
| `has_many` | source → target[] | `Vec<Target>` |
| `belongs_to` | source → target | `Option<Target>` |

## Compile-time validation

The macro validates the spec before code generation and emits `compile_error!` for:

- Unsupported `version` or `backend`
- Duplicate entity / table / field names
- Unknown field types
- References pointing to nonexistent entities or fields
- Relations with missing foreign keys on the expected side

## Example: wiring into Axum

```rust
use axum::Router;

resource_model_macro::resource_model_file!("specs/model.yaml");

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let pool = sqlx::PgPool::connect(&std::env::var("DATABASE_URL")?).await?;
    migrate(&pool).await?;

    let (api, openapi) = resource_api::router().split_for_parts();

    let app = Router::new()
        .merge(api)
        .with_state(pool);

    let listener = tokio::net::TcpListener::bind("0.0.0.0:4200").await?;
    axum::serve(listener, app).await?;
    Ok(())
}
```

## Minimum supported Rust version

Rust **edition 2024** (nightly or stable 1.85+).

## License

See [LICENSE](LICENSE) for details.
