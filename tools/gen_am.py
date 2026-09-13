#!/usr/bin/env python3
"""Compiles the Amharic catalog (apps/miniapp/src/i18n/am.ts) and a reviewer CSV
from tools/am_phrases.py specs + tools/i18n_keys.json."""
import sys, os, json, csv, re
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from eth_spec import am
from am_phrases import AM

ALLOWED_LATIN = {"Kidan", "Telegram", "KD", "JSON", "AI", "API"}
def latin_leak(val):
    val2 = re.sub(r"\{[^}]*\}", "", val)
    return [wd for wd in re.findall(r"[A-Za-z]+", val2) if wd not in ALLOWED_LATIN]

keys = json.load(open(os.path.join(HERE, "i18n_keys.json")))
missing, compiled, errors = [], {}, []
for k in keys:
    spec = AM.get(k)
    if spec is None:
        missing.append(k)
        continue
    try:
        val = am(spec)
        leak = latin_leak(val)
        if leak:
            errors.append((k, f"unresolved latin {leak} in {val!r}"))
        else:
            compiled[k] = val
    except Exception as e:
        errors.append((k, str(e)))

ts = ["// GENERATED FILE — do not edit by hand.",
      "// Amharic catalog compiled from romanised syllable specs (tools/am_phrases.py",
      "// + tools/eth_spec.py). Keys are the English source strings. Regenerate:",
      "//   python3 tools/gen_am.py",
      "export const am: Record<string, string> = {"]
def jesc(s):
    return s.replace("\\", "\\\\").replace('"', '\\"')
for k in sorted(compiled):
    ts.append(f'  "{jesc(k)}": "{jesc(compiled[k])}",')
ts.append("};")
open(os.path.join(HERE, "..", "apps/miniapp/src/i18n/am.ts"), "w").write("\n".join(ts) + "\n")

with open(os.path.join(HERE, "..", "docs", "i18n-review-sheet.csv"), "w", newline="") as f:
    wtr = csv.writer(f)
    wtr.writerow(["key (EN source)", "AM translation", "first seen at", "status"])
    for k in sorted(keys):
        wtr.writerow([k, compiled.get(k, ""), keys[k], "translated" if k in compiled else "MISSING"])

print(f"compiled {len(compiled)} / {len(keys)} keys; errors: {len(errors)}; missing: {len(missing)}")
for k, e in errors[:12]:
    print("  ERR", repr(k), e)
if missing:
    print("  missing sample:", missing[:12])
