# Install and update

In **SillyTavern 1.18.0 or newer**, open **Extensions → Install extension** and paste:

```text
https://github.com/cremefriache/LPC-Companion
```

Choose the installation target, install and reload. Git must be available on the machine running SillyTavern. No device-side build, separate backend or server plugin is needed for manual use. The local artwork library makes the first clone substantial.

Open a character chat, then **Extensions → LPC Companion**. On desktop, a compact draggable companion card provides setup and expansion controls. Narrow layouts use the floating page launcher. Welcome/no-character contexts remain inert.

Before updating, export a recovery backup. Use **Manage Extensions → Update**, then reload. If migrating from a manually copied `lpc-companion` folder, disable the old entry and keep only one copy active; the repository installer may use `LPC-Companion`. Do not delete card/chat data. Newer state/package markers may not work in older builds.

The root manifest loads `lpc-runtime.mjs` and `extension/style.css`. Assets, credits and source are local. The installation does not request artwork from the generator website. This is a beta release; see [compatibility and validation](STATUS.md), [what's new](../CHANGELOG.txt) and [Discord support](https://discord.gg/AhXhWaRKfM).
