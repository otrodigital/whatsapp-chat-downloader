# WhatsApp Chat Downloader

Export your WhatsApp Web conversations to plain `.txt` files on your own computer — whole histories,
not just what fits on screen. Formatted so you can hand them straight to an AI.

**[whatsapp-chats-downloader.otro.digital](https://whatsapp-chats-downloader.otro.digital)** ·
A local-only Chrome (Manifest V3) extension ·
A free tool by **[OTRO Digital](https://otro.digital)**

WhatsApp keeps your messages locked inside its own app. Plain text sets them loose: paste a thread
into an AI assistant, search a decade of messages with the tools you already use, or keep a readable
archive that outlives any one piece of software.

Everything runs in your own browser tab. There is no server, no network request, and no third party:
the extension reads the chats already rendered on the page and writes files to your Downloads folder.

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
[12/25/2024 10:33] Ada Lovelace: <image omitted> here's the room
[12/25/2024 10:35] Me: (replying to: Hello there) still around?
* Messages and calls are end-to-end encrypted.
```

## What it does

- **Full history, not just what's on screen.** The exporter scrolls back through each conversation,
  loading older messages as it goes, and collects everything it finds along the way.
- **Bulk export.** Scan your chat list, tick the conversations you want, and leave it running. One
  file per chat, or a single combined file for one-shot AI ingestion.
- **Sender, date and time on every line**, so an AI reading the file can follow who said what, and when.
- **Replies, system notices and media placeholders** are preserved rather than silently dropped.
- **JSON option** with parsed timestamps and message direction, for scripting against the data.
- **No build step.** A handful of readable files with no bundler, no dependencies and no remote code.

## Install

1. Open `chrome://extensions`.
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked** and select this folder.
4. Open [web.whatsapp.com](https://web.whatsapp.com/) and sign in.
5. Click the extension icon.

Requires Chrome 102 or later, or a Chromium-based browser such as Edge, Brave or Arc.

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

Every file opens with a header describing what it contains, then one line per message, as in the
sample above.

Dates are reproduced exactly as WhatsApp displays them, because `03/04/2025` is genuinely ambiguous
across locales. The header states which order was detected so an AI reading the file isn't guessing;
detection uses the first unambiguous date in the chat and falls back to month-first.

## Privacy

It cannot leak your messages, because it never sends them anywhere. This isn't a promise about how
carefully data is handled on a server — there is no server. The extension contains no code that
opens a network connection, which you can verify by reading the source.

- **No servers.** Nothing is uploaded, because there is nowhere to upload it to.
- **No analytics.** No telemetry, no crash reporting, no usage tracking.
- **No accounts.** Nothing to sign up for and no identifiers of any kind.
- **One site.** Access is limited to `web.whatsapp.com` and nowhere else.

The only thing stored is your export settings, in Chrome's local storage. Full policy in
[PRIVACY.md](PRIVACY.md).

## What it doesn't do

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

## FAQ

**How is this different from WhatsApp's own export?**
WhatsApp can email you one conversation at a time from your phone. This exports many conversations in
a single run, straight to files on your computer, in a consistent format with a header describing
each file's contents.

**Can I use the exported files with ChatGPT or Claude?**
That's what the format is designed for. Each line carries the sender, date and time, so an AI can
follow the conversation. There's also an option to write every chat into a single combined file for
pasting or uploading in one go.

**Does it export group chats?**
Yes. In group conversations each message keeps the name of the person who sent it, exactly as
WhatsApp displays it.

**Will it download my photos and voice notes?**
No. Media files are not saved. They appear in the text as placeholders such as `<image omitted>` or
`<audio omitted>`, with any caption preserved.

**Does it work on Firefox or Safari?**
Not currently. It's built for Chrome and Chromium-based browsers, and needs Chrome 102 or later.

**Is it free?**
Yes — free and open source, with no paid tier.

## If a scan finds nothing

1. Reload the WhatsApp Web tab and try again. (The extension injects itself on demand, so this
   should not be needed, but it costs nothing.)
2. Make sure the chat list is actually on screen — not the Archived view or a search result.
3. Open DevTools on the WhatsApp tab, paste in the contents of [`diagnose.js`](diagnose.js), and read
   the report. It prints which row selectors match and how the list is nested, using structure only:
   tag names, roles and text *lengths*, never chat names or message text. It copies itself to the
   clipboard, so the output is safe to paste into an issue.

The scanner tries `role="listitem"`, then `role="row"`, then falls back to grouping titled spans by
their positioned ancestor, so it survives most markup changes. When every strategy fails it says so
rather than quietly returning an empty list.

## Development

| File | Role |
| --- | --- |
| `manifest.json` | MV3 manifest; `storage`, `downloads` and `scripting`, scoped to web.whatsapp.com. |
| `content.js` | The exporter: walks the chat list, scrolls history, parses messages, renders output. |
| `background.js` | Service worker that owns `chrome.downloads` so batch saves don't prompt per file. |
| `popup.html/.js/.css` | Chat picker, options, progress and activity log. |
| `diagnose.js` | Paste into the page console when a scan finds nothing; reports structure only. |
| `build.sh` | Builds the Chrome Web Store upload package into `dist/`. |
| `tools/` | Package validator, site checker and artwork renderer. |
| `store/` | Generated promo tiles and a render of the popup UI. |
| `site/` | Marketing microsite. |
| `test/` | Unit tests for the parser. |
| `STORE.md` | Store listing copy, permission justifications, submission checklist. |
| `PRIVACY.md` | Privacy policy — must be hosted at a public URL before submitting. |

```sh
cd test && npm install && npm test   # 23 tests: parsing, order merging, dates, rendering
node tools/validate.js               # manifest, popup wiring, message contract, permissions
node tools/check-site.js             # microsite structured data and meta tags
```

Two details in `content.js` are worth reading before you change it:

- `mergeOrder` — WhatsApp recycles message DOM nodes while you scroll, so messages are harvested over
  many overlapping passes and merged back into true conversation order using the shared messages
  between passes as sync points. An upward pass loads history; a final downward sweep catches any
  stretch that was recycled out from under it.
- `parseRow` — reads `data-pre-plain-text` (WhatsApp's own `[time, date] Sender:` metadata) as the
  primary source of truth, with fallbacks to the bubble clock and the last date divider.

The tests cover exactly the parts that break when WhatsApp changes its markup, against a simulated
DOM. Live scrolling is not covered — that needs a real browser with a signed-in session.

## Packaging a release

```sh
./build.sh      # validates, runs tests, writes dist/whatsapp-chat-downloader-<version>.zip
```

The build packages runtime files only — tests, tooling, docs and `diagnose.js` are left out. It
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
**[whatsapp-chats-downloader.otro.digital](https://whatsapp-chats-downloader.otro.digital)** — one
static HTML file, no build step, with Open Graph tags, a sitemap and `SoftwareApplication` +
`FAQPage` structured data.

It deploys to GitHub Pages automatically on any push to `main` that touches `site/`.

```sh
node tools/check-site.js   # structured data, meta lengths, anchors, assets
```

See [site/README.md](site/README.md) for the one-time Pages and DNS setup, and post-launch SEO steps.

## Continuous integration

| Workflow | Trigger | What it does |
| --- | --- | --- |
| [`ci.yml`](.github/workflows/ci.yml) | Push to `main`, any PR | Syntax-checks the extension scripts, runs the validators and the parser tests, builds the package and uploads it as an artifact. |
| [`deploy-site.yml`](.github/workflows/deploy-site.yml) | Changes under `site/` on `main` | Publishes the microsite to GitHub Pages. Gated on `check-site.js`. |
| [`release.yml`](.github/workflows/release.yml) | Tag matching `v*` | Verifies the tag matches `manifest.json`, builds the zip and publishes a GitHub release with it attached. |

Cutting a release:

```sh
# bump "version" in manifest.json first, then:
git tag v1.0.1 && git push origin v1.0.1
```

The tag must match the manifest version or the workflow fails — otherwise you ship a zip labelled
with the wrong version, which the store then rejects.

No secrets are needed by any of the three workflows — Pages and the release both authenticate with
the repository's built-in token.

Pages needs one setting turned on before the first deploy: **Settings → Pages → Build and deployment
→ Source: GitHub Actions**. See [site/README.md](site/README.md) for that and the DNS record for the
custom domain.

---

## OTRO Digital

Chat Exporter is a free, open-source tool from **OTRO Digital**.

- [otro.digital](https://otro.digital)
- [github.com/otrodigital](https://github.com/otrodigital)

Not affiliated with, endorsed by, or sponsored by WhatsApp LLC or Meta Platforms, Inc. "WhatsApp"
is a trademark of its respective owner.
