# MusicXML 4.0 XSD — vendored for tools/musicxml-check.sh

| File | Source | Notes |
|---|---|---|
| `musicxml.xsd` | https://raw.githubusercontent.com/w3c/musicxml/v4.0/schema/musicxml.xsd | The W3C MusicXML 4.0 schema (score-partwise + score-timewise). sha256 `bfe37ed25a9ec00e6f2591d53df260b84efe12aed209ba3ac0a76f9287665a99`. |
| `xml.xsd` | https://raw.githubusercontent.com/w3c/musicxml/v4.0/schema/xml.xsd | Imported by musicxml.xsd (the `xml:` namespace). |
| `xlink.xsd` | https://raw.githubusercontent.com/w3c/musicxml/v4.0/schema/xlink.xsd | Imported by musicxml.xsd (the `xlink:` namespace). |
| `catalog.xml` | https://raw.githubusercontent.com/w3c/musicxml/v4.0/schema/catalog.xml | OASIS XML catalog mapping the schema's `http://www.musicxml.org/xsd/…` import locations to these local copies, so xmllint validates with `--nonet`. |

Licence: "Copyright © 2004-2021 the Contributors to the MusicXML Specification,
published by the W3C Music Notation Community Group under the W3C Community
Final Specification Agreement (FSA): https://www.w3.org/community/about/agreements/final/"
(the files' own headers). Fetched 2026-11-27 from the `v4.0` tag of
github.com/w3c/musicxml. Never shipped — tools/package.mjs takes only the app.

Usage: `tools/musicxml-check.sh <file.musicxml>` → exit 0 when well-formed and
schema-valid. The export writer is src/export/musicxml.js; the headless dump is
`node tools/musicxml-dump.mjs <song.mid> [--rollnotes <file>] [--out <file>]`.
