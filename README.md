# The Word

Life Navigation starts with one command field. Try `help`, `show task queue`, `navigate to 45.52, -122.68`, `reflect on a conversation`, or `propose an improvement: shorten task summaries`.

The optional AI core shares one local worker across the assistant and development team. Proposal mode plans, drafts, reviews the actual draft, and revises it. Results stay as text for the developer to inspect and test. Owner controls govern model downloads, local inference, and spoken replies. The worker shuts down after 30 seconds idle, on owner cancellation, or when the page closes. The initial Qwen quantized model file is about 786 MB and downloads only after enabling AI and requesting inference.

The native Android build uses installed on-device speech recognition and local Android text-to-speech voices. Voice input fills the command field for review. The share command prepares a reply for the system share sheet, where the owner chooses its destination.

The compass points directly toward a latitude and longitude. It does not calculate street routes. Reflection prompts draw on Robert Madrid's Theory of Experiential Existence and run without a model download.

Run `node --test tests/*.cjs` and `node scripts/prepare-web.cjs`. The Android debug APK workflow creates an isolated test package. Existing installations of the signed preview use a separate build signed with the preview certificate.
