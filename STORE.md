# Chrome Web Store submission

Everything the dashboard asks for, plus the things most likely to get this particular extension
rejected. Read the two blockers first.

---

## Read this first: two likely rejections

### 1. The name uses someone else's trademark

**Already applied** — `manifest.json` now reads `Chat Exporter for WhatsApp Web`. The note below
explains why, in case you are considering changing it back.

The old name, `WhatsApp Chat Downloader`, led with a trademark you don't own. Store policy allows referring to a
product for compatibility, but not in a way that implies affiliation — and a name that *starts* with
the trademark usually reads that way to a reviewer.

**Recommended:** rename to a "for" construction, which is the accepted pattern.

```sh
# Applies the safer name to the manifest, then rebuilds.
sed -i '' 's/"name": "WhatsApp Chat Downloader"/"name": "Chat Exporter for WhatsApp Web"/' manifest.json
sed -i '' 's/"default_title": "WhatsApp Chat Downloader"/"default_title": "Chat Exporter for WhatsApp Web"/' manifest.json
./build.sh
```

Keep the disclaimer at the bottom of the listing description either way.

### 2. Automating a third-party site

The extension drives `web.whatsapp.com` by clicking through conversations. Reviewers scrutinise
this, and it may conflict with WhatsApp's own terms of service regardless of what the store decides.
Exporting your own messages is ordinarily reasonable — WhatsApp ships a manual export itself — but
be aware you may be rejected, and that the risk is real rather than theoretical.

**If you don't need public distribution, don't ask for it.** Two lower-friction routes:

- **Unlisted** — still reviewed, but not searchable. Shareable by direct link.
- **Private / self-hosted** — skip the store: publish the `dist/` zip on GitHub Releases and have
  users install it unpacked via Developer mode. No review, no trademark question. For a personal
  tool this is usually the right answer.

---

## Before you submit

- [ ] Confirm an export actually completes on a real account. **Do not ship this unverified.**
- [ ] Decide on the name (above).
- [ ] Host `PRIVACY.md` at a public URL — GitHub Pages or a gist both work. Required.
- [ ] Capture real screenshots (see below).
- [ ] `./build.sh` and upload `dist/whatsapp-chat-downloader-<version>.zip`.

## Listing fields

**Name** (45 char max)
```
Chat Exporter for WhatsApp Web
```

**Short description** (132 char max — this is the manifest `description`)
```
Export WhatsApp Web chats to TXT files. Bulk download your full chat history, ready for AI, backup or search. Runs locally.
```

Store search weighs the name and this description heavily, so both lead with the terms people
actually type: *export*, *WhatsApp Web*, *chats*, *TXT*, *download*, *chat history*, *backup*.

**Category:** Productivity — **Language:** English

**Detailed description**
```
Save your WhatsApp Web conversations as plain text files on your own computer, formatted so you can
drop them straight into an AI assistant, a search index, or your own notes.

HOW IT WORKS
Open WhatsApp Web, click the extension, and pick the chats you want. The exporter opens each
conversation and scrolls back through its history, collecting every message it finds, then writes
one .txt file per chat to your Downloads folder.

WHAT YOU GET
- One .txt per chat, with a header giving the chat name, message count and date range
- Optionally a single combined .txt containing every chat, for one-shot AI ingestion
- Optionally .json per chat, with parsed timestamps, for scripting
- Messages tagged with sender, date and time, exactly as WhatsApp displays them
- Replies, system notices and media placeholders preserved

PRIVATE BY CONSTRUCTION
The extension makes no network requests at all. There is no server, no account, and no analytics.
It reads the page in front of you and writes files to your disk. Nothing else.

GOOD TO KNOW
- Opening a chat marks it as read, exactly as if you had clicked it yourself
- Long histories take time; there are caps for message count and date range
- Media files are not downloaded, they appear as placeholders, and captions are kept
- Archived chats are not included

A free tool by OTRO Digital - https://otro.digital
Source and issues: https://github.com/otrodigital/whatsapp-chat-downloader

Not affiliated with, endorsed by, or sponsored by WhatsApp LLC or Meta Platforms, Inc.
```

## Single purpose statement

```
The extension has one purpose: exporting the user's own WhatsApp Web conversations to local text
files on their computer.
```

## Permission justifications

Paste these into the matching dashboard boxes.

**`host_permissions` — https://web.whatsapp.com/**
```
The extension reads conversation text from the WhatsApp Web page in order to export it. This is the
extension's entire function, and it requests access to no other site.
```

**`downloads`**
```
Used to write the exported .txt and .json files to the user's Downloads folder. Batching through the
downloads API avoids prompting the user separately for every file in a multi-chat export.
```

**`storage`**
```
Stores the user's export preferences (speed, history window, message cap, output formats) locally so
they persist between sessions. No message or contact data is stored.
```

**`scripting`**
```
Injects the exporter into an already-open WhatsApp Web tab. Without it, a user who installs the
extension while WhatsApp Web is open must reload the tab before anything works.
```

**Remote code:** No. All code is contained in the package; nothing is fetched or evaluated at runtime.

## Data usage disclosures

Tick **no** for every data-collection category, then certify all three statements:

- Not being sold to third parties — **true**
- Not being used or transferred for purposes unrelated to the item's single purpose — **true**
- Not being used or transferred to determine creditworthiness or for lending — **true**

Privacy policy URL: wherever you host `PRIVACY.md`.

## Screenshots

Required: at least one, at **1280x800** or 640x400 PNG. Up to five.

`store/popup-1280x800.png` and `site/browser.png` are renders of the real popup UI, useful as a
starting point. They are compositions, not captures: the browser frame and the page behind the popup
are illustrations. Store policy wants screenshots of the working extension, so capture these
yourself against your own account:

1. The popup with a scanned chat list, chats ticked — the core interaction.
2. An export in progress: progress bar, current chat, message count ticking up.
3. The resulting `whatsapp-export/` folder of .txt files in Finder.
4. An exported .txt open in a text editor, showing the format.

Blur or crop contact names before uploading. Store screenshots must show the real extension —
don't dress up a mockup as a capture.

## Step by step

**One-time account setup**

1. Go to the [Developer Dashboard](https://chrome.google.com/webstore/devconsole) and sign in with
   the Google account that should own the listing. Use an account you control long-term — transferring
   an item later is awkward.
2. Pay the **one-time $5 registration fee**. Until it is paid you cannot create an item.
3. Fill in the account-level publisher details: a public display name (use *OTRO Digital*), a contact
   email, and verify that email. Unverified contact email blocks publishing.

**Each submission**

4. Build the package:

   ```sh
   ./build.sh          # -> dist/whatsapp-chat-downloader-<version>.zip
   ```

5. In the dashboard, **Items → Add new item**, and upload that zip. The store reads the name,
   version, description and permissions from `manifest.json`.
6. Fill in the **Store listing** tab: detailed description, category, language, screenshots, and
   optionally the promo tiles in `store/`. All the copy is in the sections above.
7. Fill in the **Privacy practices** tab: the single purpose statement, a justification for every
   permission, and the "not being sold / not unrelated use / not creditworthiness" certifications.
   Add the public URL where you host `PRIVACY.md`. **This tab rejects more submissions than the code
   does** — an empty justification is an automatic bounce.
8. Choose visibility: **Public**, **Unlisted** (reachable by link, not searchable), or **Private**
   (specified accounts or a Workspace domain).
9. **Submit for review.**

**Publishing an update**

10. Bump `version` in `manifest.json`, rebuild, and upload the new zip to the same item. The store
    rejects a re-upload of a version number that already exists. Updates are reviewed too, though
    usually faster, and roll out to existing users automatically.

## After submission

Review typically takes a few days and can take longer for an extension that automates another site.
If rejected, the notice names the policy section; the fixes are usually the name, the permission
justifications, or the privacy policy URL.

## Automating updates

[`.github/workflows/publish-store.yml`](.github/workflows/publish-store.yml) uploads a new build to
an existing item through the Chrome Web Store API. It is manual (**Actions → Publish to Chrome Web
Store → Run workflow**) and defaults to uploading a **draft**, so you can look at it in the dashboard
before anything reaches users. Tick `publish` to submit for review in the same run.

It cannot do the first submission — the item, the listing copy, the screenshots and the privacy
disclosures all have to exist first, and only the dashboard can create them.

Four secrets are needed:

| Secret | Where it comes from |
| --- | --- |
| `CHROME_EXTENSION_ID` | The 32-character id in the item's dashboard URL, once the item exists. |
| `CHROME_CLIENT_ID` | Google Cloud console: create a project, enable the **Chrome Web Store API**, create an OAuth client of type *Desktop app*. |
| `CHROME_CLIENT_SECRET` | Same OAuth client. |
| `CHROME_REFRESH_TOKEN` | Obtained once, by authorising that client for the `https://www.googleapis.com/auth/chromewebstore` scope and exchanging the resulting code. |

Keep the refresh token somewhere safe: it grants the ability to publish updates to your extension.
Revoke it in your Google account's third-party access settings if it ever leaks.
