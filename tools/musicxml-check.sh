#!/bin/sh
# tools/musicxml-check.sh <file.musicxml> [...]
# Validates Export score / tab's MusicXML against the W3C MusicXML 4.0 XSD
# vendored in tests/fixtures/musicxml-xsd/ (schema + the xml/xlink imports it
# names, resolved through its own catalog.xml — no network). Exit 0 = every
# file is well-formed AND schema-valid. Part of the ship checklist for
# docs/plans/2026-11-27-score-tab-export.md: run it on an exported FF1 file
# (tools/musicxml-dump.mjs writes one headless).
set -u
here=$(cd "$(dirname "$0")/.." && pwd)
xsd="$here/tests/fixtures/musicxml-xsd"
[ $# -ge 1 ] || { echo "usage: tools/musicxml-check.sh <file.musicxml> [...]" >&2; exit 2; }
rc=0
for f in "$@"; do
  if XML_CATALOG_FILES="$xsd/catalog.xml" /usr/bin/xmllint --nonet --noout --schema "$xsd/musicxml.xsd" "$f" 2>&1; then :; else rc=1; fi
done
exit $rc
