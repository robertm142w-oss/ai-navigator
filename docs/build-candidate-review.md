# Candidate review

Capacitor: MIT, upstream https://github.com/ionic-team/capacitor. Preferred packaging candidate; upstream v8 docs require Node 22+, Android SDK and Android Studio toolchain. Exact release and dependency audit pending.

Termux build guide: CC0 per https://github.com/rayzery/termux-capacitor-apk. Fallback only: requires phone setup and several GB storage; do not run third-party scripts without inspection.

TinyWhale: Apache-2.0 per https://github.com/tantara/transformers.js-chrome. WebGPU caching and resource management reference; Android support in progress. Do not import wholesale.

DVAI Bridge: insufficient verified evidence; hold.

## Integration gate
Inspect existing Android project/package ID and signing continuity first. Pin release and lock dependencies, audit licenses and vulnerabilities, stage web assets from root index.html, create isolated debug build, test AI and permissions. Preserve existing APK. No paid services or automatic deployment. No candidate code has been installed or executed yet.
