# Your companion, day to day

## Start with a character chat

Open an ordinary character chat, then **Extensions → LPC Companion** (or click **"Click here to setup {{char}}'s avatar"** on the compact Tamagotchi desktop card). Choose **Set up companion** / **Catalog studio** to open the Full catalog studio with a clothed starter character. Preview your look and explicitly **Apply**. The welcome screen has no active companion workspace.

On desktop viewports (`>= 701px`), the companion starts in a compact Tamagotchi-style stage that you can drag by its header/stage, resize from its bottom-right corner, or expand/minimize (`—`). On narrow/mobile screens (`<= 700px`), the floating page launcher stays a compact circle icon. Enter/Space toggles a focused launcher and arrow keys move it. It stays inside the page. Colors, fonts and sizing inherit your SillyTavern theme.

## Enable, tools and appearance sharing

The settings drawer contains **Enable LPC Companion**, **Enable Tool Calling**, and **Share Appearance Context**. Manual controls work with tool calling off. With LPC and appearance sharing on, the model still receives a read-only summary of the current outfit (including garment colours), pose and scene in Chat Completion prompts, even when the inspector is closed. This does not let the model change the companion. Turn sharing off for no LPC appearance summary, or disable LPC entirely to stop its workspace, tools and sharing while retaining saved companions.

Tool calling requires the global permission and consent for the individual companion. Global permission defaults off and is saved in this browser. When enabled, companion controls are enabled when panels open; panel close or chat switching discards pending requests. Enabled/sharing preferences stay in this browser. Text Completion appearance sharing and additional live-provider/streaming combinations remain unverified.

## Defaults, chats and history

New chats copy character defaults once. Existing chats retain their snapshots. **This chat** edits the current companion; **Future chats** changes defaults for new chats. Branches inherit the accepted state at their branch point. Swipes, regeneration and deleted responses reconcile appearance to accepted history. Manual overrides follow that history with explicit ordering.

Future-default editing opens the saved defaults in their own editor, even when this chat uses a different companion format. If deleting a setup-changing response removes an outfit needed by a later selection, that selection stays in history but remains inactive until its setup is restored. Compatible later overrides still apply.

Keep one active writer per chat. SillyTavern lacks a general compare-and-swap save API; read-back verification does not create a server transaction across devices. Ambiguous ownership or unreadable state blocks writes and offers recovery. History is bounded without silent pruning.

## Wardrobes and motion

Identity is separate from named outfits. Preview clothes in the catalog, pick 3-tone rectangular color swatches, curate a per-character **Closet**, toggle worn layers on the live panel, and save named looks. The Full catalog studio supports the pinned generator's 657 definitions across 104 slots and six profiles; compatible actual layers determine available actions.

Idle/Walk/Run provide supported ongoing loops. Other supported actions are held poses (including sitting, sleeping/dozing, and hands on hips), 12 facial moods, or 15 brief emotes/actions, with a customizable **Main Panel Repertoire** per character/outfit. Brief actions do not replay on reload. Pause, hidden panels and reduced motion affect playback. Missing required source art refuses a combination rather than silently removing garments. Source-authored views and frame layouts remain authoritative. Presentation does not resolve combat or establish inventory ownership.

Speech bubbles stay visible until you press **× (Dismiss speech)** or send the next reply. New speech replaces the previous bubble. Speech clears when a new generation starts or the chat/workspace is closed, and never saves or replays on reload.

## Import and share

In **Import JSON**, paste an official generator **version 2** export or choose its `.json` file. Preview, review diagnostics, choose the destination and Apply; Cancel makes no saved changes. The live generator can advance beyond our pin; unknown/custom art and unavailable combinations receive diagnostics.

Configuration packages carry definitions and applicable credits/notices; complete packages also carry verified selected artwork within documented size bounds. They describe the character and starting presentation, not the entire chat history. Export recovery backups before upgrades. Older builds can reject new fields/catalog IDs; retain a pre-upgrade backup for downgrade.

## Scenes and company

Choose Woodland, Hearth or Courtyard, placement/scale and background-only lighting. Ordinary chats can add one independent companion snapshot. Group chats support up to two explicitly selected members. Shared scene membership follows history; view/layout selection remains yours. A source character's defaults copy once and are not written by a roster snapshot.

## Optional model controls

Manual use needs no model or server plugin. Opt into model controls for the open panel to use the host's configured provider. The model receives supported choices; a request is prepared before verified tool records and an accepted final response authorize application. Global tool permission is saved in this browser; closing a panel discards pending requests. For full-source companions, the scoped outfit tool can equip listed closet IDs or remove a currently worn closet item/slot; it cannot invent assets or change identity. These changes follow the accepted response and chat history. Group updates are restricted to the allowed speaking member. Other providers/streaming modes need their own acceptance; see [status](STATUS.md).

## Recovery

Use the visible reload/recovery controls when a save cannot be confirmed. Keep the last accepted presentation until recovery completes. Do not overwrite unknown state or edit the same chat concurrently from another device. Export backups before replacing an installation, changing ownership or attempting downgrade. The extension never silently reinterprets other extensions' data.

If a host message changes while a companion save is preparing, the companion save is rejected; wait for the host edit to finish and retry.

The LPC settings drawer is available even before selecting a chat. It explains how to begin and disables companion controls until a character or group chat is ready. Artwork and code credits remain available. Opening this drawer does not initialize or save companion state.

Brief actions and sequences repeat after a seven-second cooldown while their panel remains active, until stopped or replaced. Pause and hidden panels suspend playback. Repeats are page-local and do not resume after reload or a history/context change.
