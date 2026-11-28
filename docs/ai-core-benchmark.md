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

## Independent reviewer check

Run `node scripts/benchmark-review.mjs <Transformers.js project> <local model root> [model id] [dtype]` with an existing Transformers.js installation and local model files. Downloads are disabled in this harness. The four fixtures compare the model's answer with a trusted arithmetic result and check the stated verdict. Output from the model is parsed as data and never executed.

The cached Qwen2.5 Q4 model passed 1 of 4 isolated reviewer fixtures on the build computer. It approved an incorrect fixture whose claimed answer was 9 and whose actual result was 3. Model initialization took 5.84 seconds, examples took 1.05–4.91 seconds each, and peak process RAM was approximately 2.86 GiB. This is a CPU-host baseline, not a phone result.

The app now holds revisions for correction when code from an earlier fenced example disappears or the final code block is left unclosed. Held revisions remain visible for review and are excluded from the saved proposal history. This is a structural check; correct code and correct expected values require independent task-specific tests.

### Replacement candidates on the same fixtures

| Local model | Model bytes | Passed | Cold model load | Peak host RSS |
| --- | ---: | ---: | ---: | ---: |
| Qwen2.5-0.5B-Instruct ONNX Q4 | 786,156,820 | 1/4 | 5.56 s | 2.86 GiB |
| Qwen2.5-Coder-0.5B-Instruct ONNX int8 | 639,402,903 | 1/4 | 2.09 s | 1.40 GiB |
| SmolLM2-360M-Instruct ONNX Q4 | 387,943,246 | 0/4 | 1.84 s | 1.15 GiB |

The Coder checkpoint was pinned to `604bb1988ff789d5024d589c63cf9ae81c0c8ab5`, with weights SHA-256 `cb62cac8484892079798a70b791d9f1b178735e0456e904011cce52ecd3c8787`. The SmolLM2 checkpoint was pinned to `a10cc1512eabd3dde888204e902eca88bddb4951`, with weights SHA-256 `a4ffda96e65beafc6f6cef0cbcf9fdc1cbdd79c230906bf3897d190547c7a596`. Both hashes matched the publishers' linked asset metadata.

These four fixtures are a screening test, not a broad ranking. Neither replacement improved correctness on this test. Leave the app's default in place and use independent checks for claims that can be calculated or otherwise verified. Test any future candidate on the target device before changing the release model.
