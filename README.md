# Stem Cell

A minimal, spec-driven template for building full-stack applications. Define
your data model and business workflows in two YAML files and get a
Postgres-backed REST API, SQL migrations, an admin UI, and auth — no
boilerplate.

## Origin

This repo is a **fork of
[pinsky-three/stem-cell](https://github.com/pinsky-three/stem-cell)**, the
full AI app-builder platform (12 entities, 7 systems, 3 integrations, reverse
proxy, container orchestration). It was stripped down to a **general-purpose
template** — the blank canvas that `SpawnEnvironment` clones as its
`DEFAULT_REPO_URL`.

Everything domain-specific (billing, builder pipeline, deployments, AI
provider) was removed. What remains is a multi-tenant skeleton you extend
for any product.

## Current state

| Layer | What ships |
|---|---|
| **Entities** | Organization, User, Membership |
| **Systems** | InviteMember (declarative example) |
| **Integrations** | None (add providers in `specs/systems.yaml`) |
| **Frontend** | Landing page, auth pages (login/register/forgot/reset), generated admin |
| **Auth** | Email/password + GitHub/Google OAuth (env-var configured) |
| **Infra** | Dockerfile, mise task runner, health endpoints |

## Development workflow

Features are built **frontend-first**. See
[AGENTS.md](AGENTS.md) for the full priority order.

```
1. Frontend  →  build/change pages, validate with user
2. Specs     →  update self.yaml / systems.yaml, run codegen
3. Rust      →  only for contract systems, only when deployed & needed
```

## How it works

Stem Cell compiles two spec files into a full-stack application:

**From `specs/self.yaml`** (resource-model-macro):
- Rust structs (entity, create, update) with serde + sqlx derives
- SQL migrations (CREATE TABLE with foreign keys, soft-delete, applied on startup)
- CRUD repositories backed by sqlx
- REST API (Axum + OpenAPI via utoipa) with Scalar docs at `/api/docs`
- Admin dashboard (Astro + Tailwind) with CRUD pages per entity

**From `specs/systems.yaml`** (system-model-macro + systems-codegen):
- Workflow executors for declarative multi-step business logic
- Contract-mode traits with DTOs for complex systems you implement by hand
- Contract tests scaffolded from system error definitions
- Admin pages for each system with trigger forms

Edit a spec, run `mise run dev`, and everything regenerates.

## Architecture

```
stem-cell/
├── specs/
│   ├── self.yaml               # data model — the single source of truth
│   └── systems.yaml            # business workflows & integration contracts
├── crates/
│   ├── resource-model-macro/   # proc-macro: YAML → Rust codegen
│   ├── system-model-macro/     # proc-macro: systems YAML → traits, DTOs, executors
│   ├── systems-codegen/        # CLI: materializes impl stubs + contract tests
│   └── runtime/                # binary: Axum server + build.rs (frontend codegen)
│       ├── build.rs            # reads specs → generates Astro pages → builds frontend
│       ├── src/main.rs         # connect DB, migrate, serve API + static files
│       └── src/systems/        # hand-implemented contract systems (empty by default)
├── frontend/                   # Astro 6 + Tailwind 4 (admin pages are @generated)
│   └── src/pages/              # landing + auth pages (hand-authored)
├── Dockerfile                  # multi-stage: rust:bookworm → debian:bookworm-slim
└── .mise.toml                  # tool versions + task runner
```

## Prerequisites

- [mise](https://mise.jdx.dev/) (installs Rust 1.94+ and Node 22 automatically)
- PostgreSQL (or a Neon / Supabase connection string)

## Quick start

```bash
# 1. Clone and enter
git clone https://github.com/pinsky-three/stem-cell-shrank my-app && cd my-app

# 2. Install toolchain (Rust + Node, versions locked in .mise.toml)
mise install

# 3. Configure environment
cp .env.example .env
# Edit .env — set DATABASE_URL to your Postgres connection string

# 4. Install frontend deps
mise run frontend:install

# 5. Run codegen + server (builds frontend + starts on :4200)
mise run dev
```

Then open:

| URL | Description |
|---|---|
| `http://localhost:4200` | Landing page |
| `http://localhost:4200/admin` | Admin dashboard (entity CRUD + system triggers) |
| `http://localhost:4200/api/docs` | Scalar API explorer |

## Environment variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `DATABASE_URL` | yes | — | Postgres connection string |
| `PORT` | no | `4200` | HTTP listen port |
| `SERVE_DIR` | no | `public` | Static file directory |
| `RUST_LOG` | no | `stem_cell=info,tower_http=info` | Log filter |
| `SKIP_FRONTEND` | no | — | Skip frontend build in `build.rs` (Docker & CI) |
| `APP_URL` | no | `http://localhost:4200` | Public base URL |
| `SESSION_TTL_HOURS` | no | `168` | Session lifetime in hours |
| `GITHUB_CLIENT_ID` | no | — | GitHub OAuth client ID |
| `GITHUB_CLIENT_SECRET` | no | — | GitHub OAuth client secret |
| `GOOGLE_CLIENT_ID` | no | — | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | no | — | Google OAuth client secret |
| `SMTP_HOST` | no | — | SMTP server (email disabled if empty) |
| `SMTP_PORT` | no | `587` | SMTP port |
| `SMTP_USERNAME` | no | — | SMTP credentials |
| `SMTP_PASSWORD` | no | — | SMTP credentials |
| `SMTP_FROM` | no | `noreply@example.com` | Sender address |

## Tasks (mise)

```bash
mise run frontend:dev     # Astro dev server with HMR (frontend-only iteration)
mise run frontend:install # npm install
mise run codegen          # generate stubs + tests from systems.yaml
mise run dev              # codegen → build frontend → start server
mise run dev:full         # backend + Astro HMR dev server in parallel
mise run build            # codegen → release build (frontend + server)
mise run check            # codegen → type-check only (skips frontend)
mise run lint             # codegen → clippy on entire workspace
mise run test             # codegen → run all workspace tests
mise run test:contracts   # run only contract tests
mise run ci               # full pipeline: check → clippy → test
mise run docker           # docker build -t stem-cell .
```

## Docker

```bash
docker build -t stem-cell .

docker run --rm -p 4200:4200 \
  -e DATABASE_URL="postgresql://..." \
  stem-cell
```

Two-stage build (~100 MB final) using `debian:bookworm-slim`. Runs as non-root
`app` user with a healthcheck on `/`.

## Defining your model

Edit `specs/self.yaml`:

```yaml
version: 1
config:
  visibility: "pub"
  backend: "postgres"
  api: true
  soft_delete: true

entities:
  - name: "Todo"
    table: "todos"
    id: { name: "id", type: "uuid" }
    fields:
      - { name: "title",     type: "string", required: true }
      - { name: "completed", type: "bool",   required: true }
      - name: "user_id"
        type: "uuid"
        required: true
        references: { entity: "User", field: "id" }

relations:
  - { name: "todos", kind: "has_many", source: "User", target: "Todo", foreign_key: "user_id" }
  - { name: "user",  kind: "belongs_to", source: "Todo", target: "User", foreign_key: "user_id" }
```

Supported field types: `uuid`, `string`, `text`, `int`, `bigint`, `float`, `bool`.
Supported relation kinds: `has_many`, `belongs_to`.
Fields support `required`, `unique`, and `references` (foreign keys).

See the [resource-model-macro README](crates/resource-model-macro/README.md) for the full spec format.

## Defining systems

Edit `specs/systems.yaml`:

```yaml
systems:
  - name: "CompleteTodo"
    description: "Marks a todo as completed"
    input:
      - { name: "todo_id", type: "uuid", required: true }
    steps:
      - kind: "load_one"
        entity: "Todo"
        by: "input.todo_id"
        as: "todo"
        not_found: "Todo not found"
      - kind: "update"
        entity: "Todo"
        target: "todo"
        set:
          - { field: "completed", value: true }
        as: "updated_todo"
    result:
      - { name: "todo", from: "updated_todo" }
```

Step kinds: `load_one`, `load_many`, `create`, `update`, `delete`, `guard`,
`branch`, `call_integration`, `emit_event`.

For complex logic, use `mode: "contract"` — this generates a trait + DTOs that
you implement in `crates/runtime/src/systems/<snake_name>.rs`. Run
`mise run codegen` to scaffold stubs.

## License

MIT
