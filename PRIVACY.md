# Privacy Policy

**WhatsApp Chat Downloader**
Last updated: 7 September 2026

## Summary

This extension does not collect, transmit, store, or share any of your data. Everything it does
happens inside your own browser, on your own machine.

## What the extension does

When you start an export, the extension reads the conversations already displayed on
`web.whatsapp.com` in your browser tab, formats them as text, and saves them to your computer's
Downloads folder using Chrome's normal download mechanism.

## Data collected

**None.** Specifically:

- No analytics, telemetry, crash reporting, or usage statistics.
- No accounts, logins, or identifiers of any kind.
- No message content, contact names, or phone numbers ever leave your device.
- The extension makes **no network requests whatsoever**. It contacts no server, including any
  server operated by the extension's author, because there isn't one.

## Data stored

The extension stores one thing, using Chrome's local `storage` API: your chosen export settings
(speed, history window, message cap, and which output formats are ticked). This stays on your
device and contains no message or contact data. Uninstalling the extension removes it.

The exported `.txt` and `.json` files are written to your Downloads folder. They are ordinary files
on your computer, under your control. They contain your conversation text in plain, unencrypted
form — treat them as you would any other sensitive document.

## Permissions and why they are needed

| Permission | Why |
| --- | --- |
| `host_permissions: https://web.whatsapp.com/*` | The extension can only read the WhatsApp Web page itself. It has no access to any other website. |
| `downloads` | To write the exported files to your Downloads folder. |
| `storage` | To remember your export settings between sessions. |
| `scripting` | To load the exporter into an already-open WhatsApp tab so you don't have to reload it. |

## Third parties

There are none. No data is sold, shared, or transferred to anyone, for any purpose. No third-party
libraries, SDKs, CDNs, or remote code are used — the extension is a handful of local files.

## Relationship to WhatsApp

This extension is an independent tool. It is not affiliated with, endorsed by, or sponsored by
WhatsApp LLC or Meta Platforms, Inc. "WhatsApp" is a trademark of its respective owner.

## Changes

Any change to this policy will be published in this file alongside the extension's source.

## Contact

Questions about this policy: open an issue on the extension's source repository.
