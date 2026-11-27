# AI Navigator development program

500 planned work items, organized into ten 50-item phases. Individual items must be scoped and recorded before implementation; phase allocations are planning targets, not completed tasks.

| IDs | Phase |
|---|---|
| 001–050 | Signing, reproducible builds, backups and CI |
| 051–100 | Local inference and model compatibility |
| 101–150 | Task orchestration and bounded worker concurrency |
| 151–200 | Proposal generation and independent review |
| 201–250 | Isolated testing and regression coverage |
| 251–300 | Licensed dependency research and integration |
| 301–350 | Owner approval, privacy and security |
| 351–400 | Navigation and accessibility |
| 401–450 | Performance, reliability and device testing |
| 451–500 | Release validation, documentation and maintenance |

Statuses: planned, blocked, implemented, verified. Skip blocked items, record dependencies, and continue independent work. Never expose signing secrets, execute untrusted generated code in the app, or merge unverified changes. No paid services without approval. Keep main stable. Existing blocker: original debug signing key unavailable. Initial branch changes: compass smoothing, coordinate bounds, duplicate GPS guard, model download consent, navigation test source. Tests not yet verified.
