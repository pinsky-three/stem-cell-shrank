# Agent Instructions — Stem Cell

## What this repo is

A **spec-driven template** for building full-stack applications. Three entities
(Organization, User, Membership) and one example system (InviteMember) ship as
a starting point. Everything else is added by editing two YAML files and a
handful of frontend pages.

The repo will be cloned by SpawnEnvironment as the default template — it must
stay small, boot fast, and compile cleanly.

## Development priority order

Follow this sequence strictly. **Do not jump ahead.**

### 1. Frontend first

Start every feature by building or changing the **user-facing pages**.
The frontend is cheap to iterate on (Astro + Tailwind, hot-reload via
`mise run frontend:dev`) and gives the user something to validate visually
before any backend work.

**Editable frontend surface:**

| Path | Purpose |
|---|---|
| `frontend/src/pages/index.astro` | Landing page (hand-authored) |
| `frontend/src/pages/*.astro` | Auth pages: login, register, forgot/reset password (hand-authored) |
| `frontend/src/layouts/Base.astro` | Shared shell (nav, auth check, slot) |
| `frontend/src/components/**` | React/Astro components you create |
| `frontend/src/styles/` | Tailwind global styles |

Pages under `frontend/src/pages/admin/**` are **generated** — do not hand-edit
them; they are overwritten on build.

**What to do:**
- Create or edit `.astro` pages and React components.
- Use `mise run frontend:dev` for hot-reload (no backend needed for layout work).
- Show the user the result and get approval before touching specs or Rust.

### 2. Specs second (only after frontend is validated)

Once the user has approved the frontend, update the data model and workflows
to support it.

**Editable spec surface:**

| Path | Purpose |
|---|---|
| `specs/self.yaml` | Data model: entities, fields, relations |
| `specs/systems.yaml` | Business workflows & integration contracts |

**After any spec change**, run codegen and verify:

```bash
cargo run -p systems-codegen   # generate stubs + tests
mise run check                 # type-check (no frontend build)
mise run test                  # full test suite
```

This regenerates:
- Rust structs, repos, migrations, API routes (from `self.yaml`)
- System executors, DTOs, traits, contract tests (from `systems.yaml`)
- Admin pages under `frontend/src/pages/admin/` (from both specs)

### 3. Custom Rust last (only when needed)

Write hand-implemented Rust only when:
- A system uses `mode: "contract"` and needs a body.
- The app is deployed and you discover errors or unimplemented paths.
- The user explicitly asks for backend logic.

**Editable Rust surface:**

| Path | Purpose |
|---|---|
| `crates/runtime/src/systems/*.rs` | Contract system implementations |
| `crates/runtime/src/integrations.rs` | Integration provider implementations |

Do **not** speculatively implement contract systems before the feature is
deployed and validated. Stub them with `todo!()` or a minimal happy-path
and iterate once real traffic reveals what's needed.

## Files you must NOT edit without approval

Everything below is **generated or framework code**. If the user's request
requires changes here, **STOP and explain** what's needed before proceeding.

- `crates/resource-model-macro/` — proc-macro (YAML → Rust codegen)
- `crates/system-model-macro/` — proc-macro (systems YAML → traits/DTOs)
- `crates/systems-codegen/` — CLI that generates stubs from specs
- `crates/runtime/src/main.rs` and `build.rs` — server wiring
- `crates/runtime/src/auth/` — authentication module
- `frontend/src/pages/admin/**` — generated admin pages (overwritten on build)
- `public/` — build output (gitignored)
- `Dockerfile`, `Cargo.toml`, `Cargo.lock` — infrastructure

## Quick reference

| Task | Command |
|---|---|
| Frontend dev (hot-reload) | `mise run frontend:dev` |
| Run codegen | `cargo run -p systems-codegen` |
| Dev server (backend + frontend) | `mise run dev` |
| Type-check only | `mise run check` |
| Clippy | `mise run lint` |
| Tests | `mise run test` |
| Contract tests only | `mise run test:contracts` |
| Full CI pipeline | `mise run ci` |

## Spec format cheat-sheet

**Entity fields** (`specs/self.yaml`): types are `uuid`, `string`, `text`,
`int`, `bigint`, `float`, `bool`. Add `required`, `unique`, and `references`
as needed.

**System steps** (`specs/systems.yaml`): step kinds are `load_one`,
`load_many`, `create`, `update`, `delete`, `guard`, `branch`,
`call_integration`, `emit_event`. Systems with `mode: "contract"` generate
only a trait + DTOs — you implement the body in
`crates/runtime/src/systems/<snake_name>.rs`.

## Current state

- **3 entities**: Organization, User, Membership
- **1 declarative system**: InviteMember
- **0 integrations** (add providers in `specs/systems.yaml` as needed)
- **0 contract systems** (the `crates/runtime/src/systems/` dir has only `mod.rs`)
- **Frontend**: landing page, auth pages (login/register/forgot/reset), generated admin
- **Auth**: email/password + GitHub/Google OAuth (configured via env vars)
