# WhatsApp Chat Downloader

A local-only Chrome (Manifest V3) extension that exports your WhatsApp Web conversations to `.txt`
files, formatted for feeding into an AI.

Everything runs in your own browser tab. There is no server, no network request, and no third party:
the extension reads the chats already rendered on the page and writes files to your Downloads folder.

## Install

1. Open `chrome://extensions`.
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked** and select this folder.
4. Open [web.whatsapp.com](https://web.whatsapp.com/) and sign in.
5. Click the extension icon.

## Use

1. **Scan chats** lists every conversation in your sidebar. Untick the ones you don't want, or skip
   scanning entirely and hit **Download all chats**.
2. Pick your options (see below).
3. **Download chats**. Leave the WhatsApp tab open and in the foreground while it runs — the
   extension drives the real page, so switching tabs can stall the loading of history.

Files land in `Downloads/whatsapp-export/<date>_<time>/`, one `.txt` per chat.

You can close the popup while an export runs; it keeps going and reconnects to the progress when you
reopen it. **Stop** finishes the current chat and halts.

### Options

| Option | What it does |
| --- | --- |
| Speed | Pause between scroll steps. Use **Careful** for long histories or a slow connection. |
| History | Stop scrolling back past 30/90/365 days instead of loading everything. |
| Max messages per chat | Hard cap per conversation. `0` means no limit. |
| One .txt per chat | The default output. |
| Also save one combined .txt | Every chat in a single file — handy for one-shot AI ingestion. |
| Also save .json per chat | Structured output with parsed timestamps, for scripting. |

## Output format

```
================================================================
WhatsApp chat export
Chat: Ada Lovelace
Messages: 1204
Range: 03/14/2023 09:02 -> 09/07/2026 18:41
Date format: MM/DD/YYYY (as displayed by WhatsApp)
Exported: 2026-09-07T18:42:03.918Z
================================================================

[12/25/2024 10:31] Ada Lovelace: Hello there
[12/25/2024 10:32] Me: Hi!
[12/25/2024 10:33] Ada Lovelace: <image omitted>
[12/25/2024 10:35] Me: (replying to: Hello there) still around?
* Messages and calls are end-to-end encrypted.
```

Dates are reproduced exactly as WhatsApp displays them, because `03/04/2025` is genuinely ambiguous
across locales. The header states which order was detected so an AI reading the file isn't guessing;
detection uses the first unambiguous date in the chat and falls back to month-first.

## If a scan finds nothing

1. Reload the WhatsApp Web tab and try again. (The extension now injects itself on demand, so this
   should no longer be needed, but it costs nothing.)
2. Make sure the chat list is actually on screen -- not the Archived view or a search result.
3. Open DevTools on the WhatsApp tab, paste in the contents of `diagnose.js`, and read the report.
   It prints which row selectors match and how the list is nested, using structure only: tag names,
   roles and text *lengths*, never chat names or message text. It copies itself to the clipboard.

The scanner tries `role="listitem"`, then `role="row"`, then falls back to grouping titled spans by
their positioned ancestor, so it survives most markup changes. When every strategy fails it now says
so instead of quietly returning an empty list.

## Things worth knowing before you run it

- **Opening a chat marks it as read.** The exporter clicks through conversations exactly as you would,
  so unread badges get cleared and blue ticks are sent where you have read receipts on. There is no
  way around this while driving the real UI. Export a small selection first if that matters to you.
- **Long histories take a long time.** Loading years of messages means scrolling the whole chat, one
  page at a time. A few thousand messages can take several minutes. The per-chat message cap and the
  History option exist for this.
- **Media isn't downloaded.** Images, audio, video and documents appear as `<image omitted>` markers,
  matching WhatsApp's own export convention. Captions are kept.
- **Two chats with the identical name export once.** Chats are addressed by their display name, so
  if you have two contacts saved under exactly the same name, the second is skipped and logged.
- **Archived chats are skipped** — only the main sidebar list is walked.
- **WhatsApp changes its markup without warning.** The scraper leans on stable-ish hooks
  (`data-id`, `data-pre-plain-text`, `role="row"`) with fallbacks, but a redesign can still break it.
  A chat that yields no messages is skipped and logged rather than written out empty.
- Export only conversations you're a party to, and remember the files are plain text: they contain
  everything that was said, unencrypted, on your disk.

## Packaging a release

```sh
./build.sh      # validates, runs tests, writes dist/whatsapp-chat-downloader-<version>.zip
```

The build packages runtime files only -- tests, tooling, docs and `diagnose.js` are left out. It
refuses to produce a zip if the manifest references a missing file, a popup id has drifted from
`popup.js`, a message type is unhandled, or a declared permission is unused.

Bump `version` in `manifest.json` before each build; the store rejects re-uploads of a version that
already exists.

See **[STORE.md](STORE.md)** for the submission checklist. Two things there are worth knowing before
you start: the extension name leads with a trademark you don't own and should be renamed, and an
extension that automates a third-party site draws extra review scrutiny. For a personal tool,
publishing the zip on GitHub Releases for unpacked install avoids both.

Store artwork is regenerated with `./tools/make-store-assets.sh` (needs Google Chrome). Listing
screenshots must be captured by hand from a real export.

## Microsite

[`site/`](site/) holds the marketing page for
**https://whatsapp-chats-downloader.otro.digital** — one static HTML file, no build step, with
Open Graph tags, a sitemap and `SoftwareApplication` + `FAQPage` structured data.

```sh
node tools/check-site.js   # structured data, meta lengths, anchors, assets
cd site && vercel --prod   # deploy
```

See [site/README.md](site/README.md) for deployment and post-launch SEO steps.

## Layout

| File | Role |
| --- | --- |
| `manifest.json` | MV3 manifest; `storage` + `downloads` permissions, scoped to web.whatsapp.com. |
| `content.js` | The exporter: walks the chat list, scrolls history, parses messages, renders output. |
| `background.js` | Service worker that owns `chrome.downloads` so batch saves don't prompt per file. |
| `popup.html/.js/.css` | Chat picker, options, progress and activity log. |
| `diagnose.js` | Paste into the page console when a scan finds nothing; reports structure only. |
| `build.sh` | Builds the Chrome Web Store upload package into `dist/`. |
| `tools/` | Package validator and store-artwork renderer. |
| `store/` | Generated promo tiles and a render of the popup UI. |
| `STORE.md` | Store listing copy, permission justifications, submission checklist. |
| `PRIVACY.md` | Privacy policy - must be hosted at a public URL before submitting. |
| `test/` | Unit tests for the parser (`cd test && npm install && npm test`). |
| `site/` | Marketing microsite for whatsapp-chats-downloader.otro.digital. |

Two details in `content.js` are worth reading before you change it:

- `mergeOrder` — WhatsApp recycles message DOM nodes while you scroll, so messages are harvested over
  many overlapping passes and merged back into true conversation order using the shared messages
  between passes as sync points. An upward pass loads history; a final downward sweep catches any
  stretch that was recycled out from under it.
- `parseRow` — reads `data-pre-plain-text` (WhatsApp's own `[time, date] Sender:` metadata) as the
  primary source of truth, with fallbacks to the bubble clock and the last date divider.
