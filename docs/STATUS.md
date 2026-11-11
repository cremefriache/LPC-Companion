# Compatibility and validation

**Beta release · SillyTavern 1.18.0+ & Android supported** · [Discord community](https://discord.gg/AhXhWaRKfM)

Supports SillyTavern **1.18.0 and newer**. Official SillyTavern **1.19.0** (commit `7e8663cd9c184a550b37238218bdd32c6efc68e9`) serves as the automated CI/browser/host baseline; SillyTavern **1.18.0** and **Android** are accepted via owner UAT.

Automated maintainer acceptance on 1.19.0 covers ordinary setup/editing, per-chat continuity, defaults-once, branch/swipe/delete reconstruction, ownership recovery, additional/group snapshots, supported scenes, lifecycle cleanup and theme/narrow layouts.

Repository-URL installation was exercised through the host's native depth-one Git installer using an isolated localhost smart-HTTP mirror, synthetic account/chat data and the actual published-entry layout. Publication preparation additionally checks a fresh isolated source rebuild and the exported install tree.

Live model-tool acceptance covers the documented non-streaming custom Chat Completions setup with KoboldCpp 1.119 and `koboldcpp/Gemma-4-26B-A4B-StyleTune-V2.i1-Q5_K_M`. Full-source tools also have deterministic provider-fixture acceptance. Other providers and streaming modes remain unverified. Credentials belong to the host; the extension owns none.

The catalog is pinned to official LPC commit `86160e7507d6841259cff624a51a63c1d4847ee3`, with the curated renderer/art foundation from Modern LPC `7736d762aa2113f29342dad869ef4931218aa7ae`. It includes 657 definitions and a verified local bank library of 72,914 original PNGs. All definitions have a reviewed held fixture; this does not promise every Cartesian outfit/action combination. Exact source gaps remain refusals under full-outfit gates.

Desktop cold composition (`<100ms` ceiling, measured `~6.7ms`), the full isolated desktop browser suite, 24-state SmartTheme UI contract checks, and native Git-URL installation/reload/layout checks pass alongside owner UAT acceptance on SillyTavern 1.18.0 and Android.

One writer per chat remains required. State/package limits and downgrade restrictions remain explicit. Public availability is not a stable-release or universal-device compatibility claim. See [user guide](USER_GUIDE.md), [installation](INSTALLATION.md), [upstream/licensing](UPSTREAM.md) and [Discord](https://discord.gg/AhXhWaRKfM).
