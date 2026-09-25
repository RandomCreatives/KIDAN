#!/usr/bin/env python3
"""Mechanical pass for the natural-key i18n migration.

Wraps English UI literals in t("…") for:
  - attributes: aria-label / placeholder / title / alt
  - setToast("…") / setError("…")
  - single-line JSX text nodes  >Text<  →  >{t("Text")}<
and injects `const t = useT();` + the import into configured components.
Multi-line and interpolated strings are handled manually afterwards.
English text stays byte-identical (natural keys), so tests keep passing.
"""
import re, sys
from pathlib import Path

SRC = Path(__file__).resolve().parent.parent / "apps/miniapp/src"

# file -> (import path, [component names to inject the hook into])
CONFIG = {
    "App.tsx": ("./i18n/LanguageProvider", ["App"]),
    "PilotDisabledScreen.tsx": ("./i18n/LanguageProvider", ["PilotDisabledScreen"]),
    "auth/AuthGate.tsx": ("../i18n/LanguageProvider", ["AuthGate"]),
    "auth/AuthStatusBar.tsx": ("../i18n/LanguageProvider", ["AuthStatusBar"]),
    "components/ConnectionsScreen.tsx": ("../i18n/LanguageProvider", ["ConnectionsScreen"]),
    "components/DiscoverScreen.tsx": ("../i18n/LanguageProvider", ["DiscoverScreen"]),
    "components/DiscoveryCard.tsx": ("../i18n/LanguageProvider", ["DiscoveryCard"]),
    "components/FeedbackScreen.tsx": ("../i18n/LanguageProvider", ["FeedbackScreen"]),
    "components/IntroductionScreen.tsx": ("../i18n/LanguageProvider", ["IntroductionScreen"]),
    "components/MyProfileScreen.tsx": ("../i18n/LanguageProvider", ["MyProfileScreen"]),
    "components/PairingScreen.tsx": ("../i18n/LanguageProvider", ["PairingScreen"]),
    "components/PrivacyScreen.tsx": ("../i18n/LanguageProvider", ["PrivacyScreen"]),
    "components/ProfileSheet.tsx": ("../i18n/LanguageProvider", ["ProfileSheet"]),
    "components/RealHomeGate.tsx": ("../i18n/LanguageProvider", ["RealHomeGate"]),
    "components/RequestsScreen.tsx": ("../i18n/LanguageProvider", ["RequestsScreen"]),
    "components/ReviewStatusCard.tsx": ("../i18n/LanguageProvider", ["ReviewStatusCard"]),
    "onboarding/IntroScreens.tsx": ("../i18n/LanguageProvider", ["IntroScreens", "IntroChrome"]),
    "onboarding/OnboardingFlow.tsx": ("../i18n/LanguageProvider", ["OnboardingFlow"]),
    "onboarding/FormControls.tsx": ("../i18n/LanguageProvider", []),
    "onboarding/PublicPreview.tsx": ("../i18n/LanguageProvider", []),
}

ATTR_RE = re.compile(r'\b(aria-label|placeholder|title|alt)="([^"{}\n]+)"')
TOAST_RE = re.compile(r'\b(setToast|setError)\(\s*"([^"\n]+)"\s*\)')
TEXT_RE = re.compile(r'>([^<>{}\n]+)<')


def esc(text: str) -> str:
    return text.replace("\\", "\\\\").replace('"', '\\"')


def transmute_text_nodes(line: str) -> str:
    stripped = line.lstrip()
    if stripped.startswith("//") or stripped.startswith("*") or stripped.startswith("/*"):
        return line

    def repl(m: re.Match) -> str:
        inner = m.group(1)
        text = inner.strip()
        if not re.search(r"[A-Za-z]{3}", text):
            return m.group(0)
        if text.startswith("{") or text.startswith("/*"):
            return m.group(0)
        text = text.replace("&amp;", "&").replace("&nbsp;", " ")
        lead = " " if inner[:1].isspace() else ""
        trail = " " if inner[-1:].isspace() else ""
        return f'>{lead}{{t("{esc(text)}")}}{trail}<'

    return TEXT_RE.sub(repl, line)


def process(rel: str, import_path: str, components: list) -> None:
    path = SRC / rel
    src = path.read_text()
    orig = src

    src = "\n".join(transmute_text_nodes(l) for l in src.split("\n"))
    src = ATTR_RE.sub(lambda m: f'{m.group(1)}={{t("{esc(m.group(2))}")}}', src)
    src = TOAST_RE.sub(lambda m: f'{m.group(1)}(t("{esc(m.group(2))}"))', src)

    changed = src != orig
    if changed or components:
        # import (after the last import line)
        if f'import {{ useT }} from "{import_path}"' not in src:
            lines = src.split("\n")
            last = max(i for i, l in enumerate(lines) if l.startswith("import "))
            lines.insert(last + 1, f'import {{ useT }} from "{import_path}";')
            src = "\n".join(lines)
        for name in components:
            if re.search(rf"export function {name}\(", src) and f"export function {name}(" in src:
                idx = src.index(f"export function {name}(")
                brace = src.index("{\n", idx)
                if "const t = useT();" not in src[idx:idx + 400]:
                    src = src[: brace + 2] + "  const t = useT();\n" + src[brace + 2 :]

    if src != orig:
        path.write_text(src)
        print(f"transmuted {rel}")
    else:
        print(f"unchanged  {rel}")


for rel, (imp, comps) in CONFIG.items():
    process(rel, imp, comps)
