# Compatibility and validation

**Development preview — actual Android acceptance and device performance budgets remain pending.**

The loader permits SillyTavern **1.18.0 and newer** for compatibility testing. Acceptance on 1.18.0 is pending; the verified baseline remains 1.19.0.

The browser extension is validated on official SillyTavern **1.19.0**, commit `7e8663cd9c184a550b37238218bdd32c6efc68e9`. Maintainer acceptance covers ordinary setup/editing, per-chat continuity, defaults-once, branch/swipe/delete reconstruction, ownership recovery, additional/group snapshots, supported scenes, lifecycle cleanup and theme/narrow layouts.

Repository-URL installation was exercised through the host's native depth-one Git installer using an isolated localhost smart-HTTP mirror, synthetic account/chat data and the actual published-entry layout. Narrow desktop emulation is not an Android device run. Publication preparation additionally checks a fresh isolated source rebuild and the exported install tree.

Live model-tool acceptance covers the documented non-streaming custom Chat Completions setup with KoboldCpp 1.119 and `koboldcpp/Gemma-4-26B-A4B-StyleTune-V2.i1-Q5_K_M`. Full-source tools also have deterministic provider-fixture acceptance. Other providers and streaming modes remain unverified. Credentials belong to the host; the extension owns none.

The catalog is pinned to official LPC commit `86160e7507d6841259cff624a51a63c1d4847ee3`, with the curated renderer/art foundation from Modern LPC `7736d762aa2113f29342dad869ef4931218aa7ae`. It includes 657 definitions and a verified local bank library of 72,914 original PNGs. All definitions have a reviewed held fixture; this does not promise every Cartesian outfit/action combination. Exact source gaps remain refusals under full-outfit gates.

The current desktop cold-composition performance gate remains open: an isolated maintainer run measured about 716ms against its existing 100ms ceiling. Automatic blink preparation opens the local full artwork library during the first curated render. This known cold-start regression has not been fixed or waived; historical broader acceptance does not establish that the current full browser suite passes. Current focused installation/reload/layout checks and model closet unit/history checks pass.

One writer per chat remains required. State/package limits and downgrade restrictions remain explicit. Public availability is not a stable-release or universal-device compatibility claim. See [user guide](USER_GUIDE.md), [installation](INSTALLATION.md) and [upstream/licensing](UPSTREAM.md).
