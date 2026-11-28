# AI core verification

## Current build

The automated suite checks consent, worker reuse, cancellation and idle cleanup, the four-stage proposal chain, command routing, sharing confirmation, and coordinate calculations. The deterministic command path works without a model. The app preserves review artifacts as text and exposes a Stop AI control.

A separate Linux harness used the app coordinator with a native Node.js ONNX backend and cached Qwen2.5-0.5B-Instruct Q4 weights. The model file measured 786,156,820 bytes. The web worker and Galaxy A17 were outside this harness.

| Run | Outcome | Wall time | Model load | Peak process RSS |
| --- | --- | ---: | ---: | ---: |
| 64 tokens per role | Four responses, truncated output | 24.3 s | 6.6 s | 2.86 GiB |
| 256 tokens per role | Four responses, quality gate failed | 92.7 s | 7.6 s | 3.09 GiB |

The compact SmolLM2-135M ONNX Community Q4 comparison used 180,581,125 model bytes, loaded in 2.53 seconds, completed in 79.1 seconds, and peaked at 1.25 GiB RSS. That cuts model file size by about 77% and peak RAM by about 59% against the full Qwen run. The model gave wrong expected values and produced invalid code during revision. It stays outside the release configuration.

The evaluation asked for absolute difference between two finite numbers. The initial draft used the correct operation but proposed an incorrect expected value. The reviewer missed that error and the revision discarded the runnable function. Improving semantic verification is the next AI-core gate. These measurements describe the host process. Measure the Android WebView independently before setting a device resource budget.

## Resource lookout

- Keep model download opt-in. Evaluate the Apache-2.0 [SmolLM2-135M-Instruct ONNX variants](https://huggingface.co/HuggingFaceTB/SmolLM2-135M-Instruct/tree/main/onnx) against the same tasks, with quality, latency and peak memory measured together.
- Use standard runners in the public repository and seven-day artifact retention. The repository had 35 unexpired artifacts totaling 88.8 MB on November 27, 2026. Account-wide storage and usage balances are unknown. Preserve downloadable checkpoints independently before an artifact expires. [GitHub Actions billing](https://docs.github.com/en/actions/concepts/billing-and-usage)
- Reuse installed Android speech services. Verify speech language availability, permissions and on-device responsiveness on the Galaxy A17.
- The recovered Python prototype exercises an owner-disabled provider allowlist and fallback if a provider reports unavailable. Use those behaviors as a reference for a second verified backend. The prototype providers are mocks.

## AI-first development pass

Navigation controls and native location permission are paused. The existing coordinate math and tests are retained. The recovered AI Navigator Python core's four tests passed. Its policy rejects empty provider output and only uses owner-approved providers. The app now rejects empty local model replies before advancing the proposal or saving it.

Candidate evaluation order:

1. Reuse the current ONNX model and test cases with the [ONNX Runtime Mobile usability checker](https://onnxruntime.ai/docs/tutorials/mobile/helpers/model-usability-checker.html). Measure quality, peak RAM, first-token latency and storage on Android against the existing WebView baseline.
2. Compare native [llama.cpp Android examples](https://github.com/ggml-org/llama.cpp/blob/master/docs/android.md) with the same tasks and a license-checked small GGUF model. Profile the target phone before adding another backend.
3. Use deterministic fixtures for incorrect arithmetic examples, empty responses, and lost runnable proposals. Keep fixture tests in the existing no-cost runner. Evaluate a portable local [Promptfoo configuration](https://github.com/openai/openai-cookbook/blob/main/examples/evaluation/moving-from-openai-evals-to-promptfoo.md) if the suite outgrows the existing Node runner.
