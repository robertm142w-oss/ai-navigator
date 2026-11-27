# AI core: critical-path acceptance gates

Status: specification only; none of these gates is verified by this document.

## Batch A — inventory and runnable baseline
1. Locate actual Commander, developer, reviewer, task ledger and inference implementations on ai-readiness. Record paths and entry points.
2. Run existing unit/smoke tests in a clean environment. Capture commands, exit codes and logs. Do not claim success based only on commits.
3. Identify the first failing end-to-end scenario and fix the smallest root cause, with regression test.

## Batch B — end-to-end coordination
4. A bounded Commander task produces a structured plan; validate schema and reject invalid or excessive actions.
5. Two isolated workers run concurrently with timeouts, resource caps and deterministic retry policy; reviewer can reject proposals.
6. Persist task state across restart; ensure no double execution, clear failure states, and stable recovery.

## Batch C — inference and safety
7. Verify at least one compatible free local inference backend and appropriately licensed downloadable model; measure Android RAM, storage, latency and offline behavior before selection.
8. Keep proposed code inert until owner approval and isolated test; forbid shell execution from model output in the Android app.
9. Demonstrate tests, rollback, privacy controls, versioned strategies and held-out regression checks.

## Release gate
10. Build and test a signed upgrade compatible with the installed package, or explicitly document why a fresh install is necessary. Never publish unsigned or unverified APKs as ready.

## Resource evaluation queue (not yet integrated)
- llama.cpp (MIT): C/C++ inference candidate; inspect Android JNI build, model formats, memory and battery implications.
- ONNX Runtime (MIT): Android inference candidate; inspect operator/model compatibility and package footprint.
- TensorFlow Lite / LiteRT (Apache-2.0 components): Android optimized inference candidate; verify exact component licenses.
- GitHub Actions: CI testing on available free-tier quota; verify account limits and secrets handling.
- JUnit (EPL-2.0), Robolectric (MIT), AndroidX Test (Apache-2.0): test candidates; confirm project compatibility.

No component is approved for integration solely because it appears in this queue. Evaluate provenance, transitive dependencies, model license, maintenance, security, cost, and reproducible test results.

## Task ledger rules
Track each item as planned / blocked / implemented / verified with evidence and commit links. Select 1–3 critical-path tasks per batch. On a blocker, record a safe alternative and work on independent tasks; never bypass consent, licensing, signing or verification. A 10,000-task goal is a planning horizon, not a completion count.
