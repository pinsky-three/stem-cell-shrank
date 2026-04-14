# Stem Cell

A spec-driven platform for building AI app-builders. Define your data model and business workflows in two YAML files and get a Postgres-backed REST API, reverse proxy, container orchestration, and an admin UI — no boilerplate.

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

Edit a spec, run `mise run codegen`, implement any new stubs, and everything updates.

## What it does today

Stem Cell models an **AI app-builder SaaS platform** (think Lovable/Bolt) with 12 entities across five domains:

| Domain | Entities |
|---|---|
| Tenancy & Auth | Organization, User, Membership |
| Billing | Plan, Subscription, UsageRecord |
| Core Builder | Project, Conversation, Message |
| Build Pipeline | BuildJob, Artifact |
| Deployment | Deployment |

Business workflows include project creation, message-driven AI build queuing, deployment via hosting providers, subscription upgrades, periodic deployment cleanup, and container-based dev environment spawning with a reverse proxy.

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
│       ├── src/main.rs         # connect DB, migrate, serve API + proxy + static files
│       ├── src/proxy.rs        # reverse proxy for child-environment subdomains
│       └── src/systems/        # hand-implemented contract systems
├── frontend/                   # Astro 6 + Tailwind 4 (pages are @generated)
│   └── src/components/
│       ├── ProjectView.tsx     # SPA project editor with embedded preview
│       └── HeroPrompt.tsx      # AI prompt input on landing page
├── Dockerfile                  # multi-stage: rust:bookworm → debian:bookworm-slim
└── .mise.toml                  # tool versions + task runner
```

### How it works

1. `build.rs` reads `specs/self.yaml` and `specs/systems.yaml`, generates Astro pages into `frontend/src/pages/`
2. `build.rs` runs `npm run build` to compile the frontend into `public/`
3. The proc-macros read the same specs and expand into structs, repos, migrations, API routes, and system executors
4. At startup, the server applies migrations, mounts the API under `/api/*`, serves OpenAPI docs at `/api/docs`, and serves the static frontend as a fallback
5. Subdomain requests (e.g. `<slug>.localhost:4200`) are reverse-proxied to the corresponding child environment's port

### Systems

| System | Mode | Description |
|---|---|---|
| CreateProject | declarative | Creates a project with its first conversation |
| SendMessage | declarative | Posts a user message and queues an AI build job |
| RunBuild | contract | Executes the AI code-generation pipeline |
| DeployProject | declarative | Deploys a successful build to the hosting provider |
| UpgradeSubscription | declarative | Changes an org's plan via the payment provider |
| SpawnEnvironment | contract | Creates a project, queues a build, and spawns a dev container with reverse proxy |
| CleanupDeployments | contract | Stops stale deployments, kills processes, and cleans up temp files (runs periodically) |

**Declarative** systems are fully generated from step definitions. **Contract** systems generate a trait + DTOs — you implement the body in `crates/runtime/src/systems/`.

### Integrations

| Provider | Operation | Purpose |
|---|---|---|
| ai_provider | generate_code | AI code generation from prompts |
| hosting_provider | deploy_app | Deploy built projects to subdomains |
| payment_provider | create_subscription | Process plan upgrades |

## Prerequisites

- [mise](https://mise.jdx.dev/) (installs Rust 1.94+ and Node 22 automatically)
- PostgreSQL (or a Neon / Supabase connection string)

## Quick start

```bash
# 1. Clone and enter
git clone <repo-url> stem-cell && cd stem-cell

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
| `http://localhost:4200` | Landing page with AI prompt input |
| `http://localhost:4200/admin` | Admin dashboard (entity CRUD + system triggers) |
| `http://localhost:4200/api/docs` | Scalar API explorer |
| `http://localhost:4200/project?id=<uuid>` | Project editor with live preview |
| `http://<slug>.localhost:4200` | Reverse-proxied child environment |

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
        entity: "Project"
        set:
          - { field: "name", value: "New project" }
        as: "project"
    result:
      - { name: "project", from: "project" }
```

Step kinds: `load_one`, `load_many`, `create`, `update`, `delete`, `guard`, `branch`, `call_integration`, `emit_event`.

For complex logic, use `mode: "contract"` — this generates a trait + DTOs that you implement in `crates/runtime/src/systems/<snake_name>.rs`. Run `mise run codegen` to scaffold stubs.

## Project layout

| Path | What it does |
|---|---|
| `specs/self.yaml` | Single source of truth for the data model (12 entities). |
| `specs/systems.yaml` | Business workflows (7 systems) and integration contracts (3 providers). |
| `crates/resource-model-macro/` | Proc-macro crate (YAML → Rust codegen). Independently publishable. |
| `crates/system-model-macro/` | Proc-macro crate (systems YAML → traits, DTOs, executors). |
| `crates/systems-codegen/` | CLI that materializes impl stubs and contract tests from specs. |
| `crates/runtime/` | The `stem-cell` binary. `build.rs` generates frontend pages; `main.rs` wires the server + proxy. |
| `crates/runtime/src/systems/` | Hand-implemented contract systems (RunBuild, SpawnEnvironment, CleanupDeployments). |
| `crates/runtime/src/proxy.rs` | Reverse proxy: routes subdomain requests to child environment ports. |
| `frontend/` | Astro 6 + Tailwind 4. Pages under `src/pages/admin/` are `@generated` — don't edit them. |
| `frontend/src/pages/index.astro` | Landing page (hand-authored). |
| `frontend/src/components/` | React components (ProjectView, HeroPrompt) for interactive UI. |
| `public/` | Build output from Astro (gitignored). Served as static files. |

## License

MIT
