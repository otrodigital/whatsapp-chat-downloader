# Tests

Covers the parts of `content.js` that break when WhatsApp changes its markup: message parsing,
the scroll-pass order merge, locale date handling, and output rendering. Live scrolling is not
covered — that needs a real browser with a signed-in session.

```sh
cd test && npm install && npm test
```

The harness loads `../content.js` into a jsdom window and rewrites its final export line to expose
internals, so the extension itself ships no test hooks.
