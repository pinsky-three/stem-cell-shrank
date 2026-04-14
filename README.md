# Stem Cell

A spec-driven template for building full-stack applications. Define your data model and business workflows in two YAML files and get a Postgres-backed REST API, SQL migrations, and an admin UI — no boilerplate.

Stem Cell compiles two spec files into a full-stack application:

**From `specs/self.yaml`** (resource-model-macro):
- **Rust structs** (entity, create, update) with serde + sqlx derives
- **SQL migrations** (CREATE TABLE with foreign keys, soft-delete support, run on startup)
- **CRUD repositories** backed by sqlx
- **REST API** (Axum + OpenAPI via utoipa) with Scalar docs at `/api/docs`
- **Admin dashboard** (Astro + Tailwind) with CRUD pages generated from the same spec

**From `specs/systems.yaml`** (system-model-macro + systems-codegen):
- **Workflow executors** for declarative multi-step business logic (guards, loads, creates, events)
- **Contract-mode traits** with DTOs for complex systems you implement by hand
- **Contract tests** scaffolded automatically from system error definitions
- **Admin pages** for each system with trigger forms and result display

Edit a spec, run `mise run dev`, and everything updates.

## What's included

The template ships with a minimal **multi-tenant skeleton** — 3 entities and 1 example system:

| Entity | Purpose |
|---|---|
| Organization | Tenant / workspace |
| User | Account with email + auth provider |
| Membership | Links users to orgs with a role |

| System | Mode | Description |
|---|---|---|
| InviteMember | declarative | Adds a user to an organization with a given role |

Extend these by editing the two spec files and running codegen.

## Architecture

```
stem-cell/
├── specs/
│   ├── self.yaml               # data model — the single source of truth
│   └── systems.yaml            # business workflows & integration contracts
├── crates/
│   ├── resource-model-macro/   # proc-macro: YAML → Rust codegen (publishable crate)
│   ├── system-model-macro/     # proc-macro: systems YAML → traits, DTOs, executors
│   ├── systems-codegen/        # CLI: materializes impl stubs + contract tests
│   └── runtime/                # binary: Axum server + build.rs (frontend codegen)
│       ├── build.rs            # reads specs → generates Astro pages → builds frontend
│       ├── src/main.rs         # connect DB, migrate, serve API + static files
│       └── src/systems/        # hand-implemented contract systems (empty by default)
├── frontend/                   # Astro 6 + Tailwind 4 (admin pages are @generated)
├── Dockerfile                  # multi-stage: rust:bookworm → debian:bookworm-slim
└── .mise.toml                  # tool versions + task runner
```

### How it works

1. `build.rs` reads `specs/self.yaml` and `specs/systems.yaml`, generates Astro pages into `frontend/src/pages/`
2. `build.rs` runs `npm run build` to compile the frontend into `public/`
3. The proc-macros read the same specs and expand into structs, repos, migrations, API routes, and system executors
4. At startup, the server applies migrations, mounts the API under `/api/*`, serves OpenAPI docs at `/api/docs`, and serves the static frontend as a fallback

## Prerequisites

- [mise](https://mise.jdx.dev/) (installs Rust 1.94+ and Node 22 automatically)
- PostgreSQL (or a Neon / Supabase connection string)

## Quick start

```bash
# 1. Clone and enter
git clone <repo-url> my-app && cd my-app

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
| `SKIP_FRONTEND` | no | — | Set to skip frontend build in `build.rs` (used in Docker & CI) |
| `APP_URL` | no | `http://localhost:4200` | Public base URL |
| `SESSION_TTL_HOURS` | no | `168` | Session lifetime in hours |
| `GITHUB_CLIENT_ID` | no | — | GitHub OAuth app client ID |
| `GITHUB_CLIENT_SECRET` | no | — | GitHub OAuth app client secret |
| `GOOGLE_CLIENT_ID` | no | — | Google OAuth app client ID |
| `GOOGLE_CLIENT_SECRET` | no | — | Google OAuth app client secret |
| `SMTP_HOST` | no | — | SMTP server (email features disabled if empty) |
| `SMTP_PORT` | no | `587` | SMTP port |
| `SMTP_USERNAME` | no | — | SMTP credentials |
| `SMTP_PASSWORD` | no | — | SMTP credentials |
| `SMTP_FROM` | no | `noreply@example.com` | Sender address |

## Tasks (mise)

```bash
mise run codegen          # generate stubs + tests from systems.yaml
mise run dev              # codegen → build frontend → start server
mise run dev:full         # backend + Astro HMR dev server in parallel
mise run build            # codegen → release build (frontend + server)
mise run check            # codegen → type-check only (skips frontend)
mise run lint             # codegen → clippy on entire workspace
mise run test             # codegen → run all workspace tests
mise run test:contracts   # run only contract tests
mise run ci               # full pipeline: check → clippy → test
mise run frontend:dev     # Astro dev server with HMR
mise run frontend:install # npm install
mise run docker           # docker build -t stem-cell .
```

## Docker

```bash
# Build
docker build -t stem-cell .

# Run
docker run --rm -p 4200:4200 \
  -e DATABASE_URL="postgresql://..." \
  stem-cell
```

The image is a two-stage build (~100 MB final) using `debian:bookworm-slim`. It runs as a non-root `app` user with a healthcheck on `/`.

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
  - name: "User"
    table: "users"
    id: { name: "id", type: "uuid" }
    fields:
      - { name: "name",  type: "string", required: true }
      - { name: "email", type: "string", required: true, unique: true }

relations: []
```

Supported field types: `uuid`, `string`, `text`, `int`, `bigint`, `float`, `bool`.
Supported relation kinds: `has_many`, `belongs_to`.
Fields support `required`, `unique`, and `references` (foreign keys).

See the [resource-model-macro README](crates/resource-model-macro/README.md) for the full spec format.

## Defining systems

Edit `specs/systems.yaml`:

```yaml
systems:
  - name: "MyWorkflow"
    description: "Does something useful"
    input:
      - { name: "org_id", type: "uuid", required: true }
    steps:
      - kind: "load_one"
        entity: "Organization"
        by: "input.org_id"
        as: "org"
        not_found: "Organization not found"
      - kind: "guard"
        check: { field: "org.active", equals: true }
        error: "Org is not active"
      - kind: "create"
        entity: "Membership"
        set:
          - { field: "role", value: "member" }
        as: "membership"
    result:
      - { name: "membership", from: "membership" }
```

Step kinds: `load_one`, `load_many`, `create`, `update`, `delete`, `guard`, `branch`, `call_integration`, `emit_event`.

For complex logic, use `mode: "contract"` — this generates a trait + DTOs that you implement in `crates/runtime/src/systems/<snake_name>.rs`. Run `mise run codegen` to scaffold stubs.

## License

MIT
