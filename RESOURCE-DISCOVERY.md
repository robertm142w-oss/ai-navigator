# Initial resource discovery — 2026-11-26

Initial screening recorded; full 15-minute duration and measured savings not established. No external code imported. Ranking is provisional, based on fit, license expectations (verify exact revision before reuse), maintenance signals, isolation, zero marginal service cost and qualitative effort avoided.

| Rank | Candidate | Fit / license / maintenance / security / cost / savings |
|---|---|---|
| 1 | [smolagents](https://github.com/huggingface/smolagents) | Python reference for bounded agents, tools, local models and sandbox adapters; Apache-2.0 expected; active repository; execution disabled in our app; local compute only; high conceptual reuse, not drop-in |
| 2 | [OpenHands](https://github.com/OpenHands/OpenHands) | Full coding workflow and sandbox architecture; MIT core expected, check enterprise exceptions; active; desktop/server dependencies and privileged Docker risks; local compute possible; high workflow reuse, low mobile fit |
| 3 | [AutoGen](https://github.com/microsoft/autogen) | Multi-agent delegation patterns; MIT code expected, verify docs separately; repository reports archived Nov 20 2026; reference only, no unmaintained runtime adoption; local models possible; medium conceptual reuse |
| 4 | [SWE-agent](https://github.com/SWE-agent/SWE-agent) | Issue-to-fix and test loop; MIT expected; repository available; external execution and model requirements; reference only; medium reuse |
| 5 | [Transformers.js](https://github.com/huggingface/transformers.js) | Existing browser WASM engine; Apache-2.0 expected; maintained; pin dependencies and model revision, audit CDN and network; no API fee; highest immediate compatibility |
| 6 | [WebLLM](https://github.com/mlc-ai/web-llm) | Browser WebGPU alternative; Apache-2.0 expected; maintained; device capability and memory gate; local compute; medium potential speed gain |
| 7 | [llama.cpp](https://github.com/ggml-org/llama.cpp) | Native Android alternative; MIT expected; maintained; JNI packaging and native attack surface; local compute; medium long-term potential |
| 8 | [QuickJS WASM wrapper](https://github.com/sebastianwessel/quickjs) | Potential isolated JS testing; license and maintenance revision pending; no host imports/network/files, strict resource limits and independent security review required; local compute; medium potential |

Free tooling: built-in Node test runner for trusted code; GitHub Actions standard public runners subject to eligibility and usage limits (do not enable paid usage); local Android device for real inference. Node vm and Web Workers are not security boundaries for arbitrary generated code. Do not execute model output. No paid sandbox services.

Gaps: model reload per worker, no bounded correction stage, no actual device inference evidence, no validated structured proposal format, no isolated execution boundary, no measured baseline. Next: benchmark fake-engine orchestration and real-device latency separately; record elapsed time, peak memory, successful tasks and quality on identical inputs before claiming savings. Keep current engine; adapt workflow ideas rather than importing Python frameworks. Verify exact licenses, model weights, transitive dependencies and notices before any adoption.
