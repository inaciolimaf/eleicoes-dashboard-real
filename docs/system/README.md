# System documentation

How the system works **today**, one file per domain. It describes the code, not the plan: what
was asked and why lives in `specs/`; when the code diverges from a spec, the domain file records
it under "Points of attention".

| File | Domain | Spec |
|---|---|---|
| [overview.md](overview.md) | architecture, processes, settings, errors, database and migrations, deploy | `specs/05-architecture.md`, `specs/10-docker.md` |
| [collection.md](collection.md) | collector, TSE formats, JWS, job queue, fake TSE | `specs/02-tse-data-sources.md`, `specs/03-section-granularity.md` |
| [processing.md](processing.md) | worker, ingestion, tally of polling places, events, real time | `specs/05-architecture.md`, `specs/06-data-model.md` |
| [public-api.md](public-api.md) | public routes: results, geo areas, maps, polling places, sections, candidates, search, exports | `specs/11-api-contract.md` |
| [accounts.md](accounts.md) | users and login, dashboards, shares, favorites, preferences, alerts, admin | `specs/04-requirements.md` |
| [frontend.md](frontend.md) | stack, screens, modules, API client, real time, tests | `specs/09-frontend.md` |

Terms: [`docs/glossary.md`](../glossary.md). Deploy: [`docs/deploy-coolify.md`](../deploy-coolify.md).

## Update rule

The system changed, the documentation changes **in the same commit**: route, table, flow, rule,
environment variable, new, removed or renamed file → the domain's file here. New domain → new
file + a line in the table above. Guarantee: `make docs` (`backend/tools/docs_coverage.py`, in
CI) fails when a module, package or screen is not cited (DOC001) or when a cited path no longer
exists (DOC002).

## Template for a domain file

```markdown
# <Domain>
One paragraph: what it is for whoever uses it and the spec it came from.
## Where it is         table File | Role (backend, frontend, tests)
## Data                tables and the migration that created them; Redis keys; files on disk
## Routes              table Method and path | What it does | Errors (problem+json type)
## How it works        main flows, in order, with function names
## Rules and guarantees each invariant and the test that guarantees it (`backend/tests/<file>.py::<name>`)
## Settings            the domain's environment variables
## Points of attention pitfalls, non-obvious decisions, divergences from the spec
```

Paths between backticks, relative to the repository root. Product text quoted here (a label, an
error `detail`) stays in Portuguese. 100–300 lines per file.
