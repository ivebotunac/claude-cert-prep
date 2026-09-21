#!/bin/sh
# Regenerate content/exam-guide.txt from content/exam-guide.pdf.
#
# tests/unit/guide.test.js compares every figure the app publishes to the guide's
# own words, and it reads the text file rather than the PDF so the suite needs no
# PDF parser and no extra dependency. Run this after replacing the PDF, then run
# the test: a revision that moved a number will say so.
#
# The text comes out with ALL whitespace removed, which looks wrong and is not.
# The guide's typesetting breaks glyph runs inside words, so every extractor
# returns "Orchestr a tion" and "Cl aude". With the whitespace gone the comparison
# is exact again, and a grep for an identifier like fork_session still works.
#
# macOS only: PDFKit is what reads the PDF. Nothing else here needs it.
set -e
cd "$(dirname "$0")/.."

command -v swift > /dev/null 2>&1 || {
  echo "needs swift, which comes with the Xcode command line tools" >&2
  exit 1
}

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

cat > "$work/extract.swift" <<'SWIFT'
import Foundation
import PDFKit

let url = URL(fileURLWithPath: CommandLine.arguments[1])
guard let doc = PDFDocument(url: url), let text = doc.string else {
  FileHandle.standardError.write("no text layer in \(url.lastPathComponent)\n".data(using: .utf8)!)
  exit(1)
}
print(text)
SWIFT

swift "$work/extract.swift" content/exam-guide.pdf > "$work/raw.txt"
node -e 'const fs = require("fs"); const t = fs.readFileSync(process.argv[1], "utf8").replace(/\s+/g, ""); if (t.length < 50000) { console.error("extracted only " + t.length + " characters, expected about 72000"); process.exit(1) } fs.writeFileSync(process.argv[2], t); console.error("content/exam-guide.txt: " + t.length + " characters")' "$work/raw.txt" content/exam-guide.txt
