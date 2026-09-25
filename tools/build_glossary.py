#!/usr/bin/env python3
"""Regenerates docs/i18n-glossary-am.md AM cells from compiled specs."""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from eth_spec import w

L = {}
L["(እርስዎ"] = f"(እርስዎ … verbs in plural-polite imperative: {w('yjmrw')}, {w('yasgabu')}, {w('ylku')}); third person for"
L["| 1 |"] = f"| 1 | Kidan (wordmark) | **Kidan** (Latin, unchanged) | Brand asset stays Latin in both locales (as Telegram/Facebook do in Amharic UIs); codes stay `KD-…`. Alt: render as {w('kidan')} in Amharic locale. |"
L["| 2 |"] = f"| 2 | introduction (matchmaking) | **{w('twwq')}** | The culturally exact word for a mediated introduction toward marriage. |"
L["| 3 |"] = f"| 3 | introduction request | **{w('yetwwq')} {w('tyaq')}** | Compositional and instantly legible. |"
L["| 4 |"] = f"| 4 | connection (approved pair) | **{w('gnyt')}**; tab = **{w('gnytoch')}** | Neutral and warm. Alt: {w('twwq')} (collides with #2). |"
L["| 5 |"] = f"| 5 | private shortlist | **{w('yegl')} {w('mrcha')} {w('zrzr')}** (short: **{w('zrzr')}**) | \"Your private list of choices\"; never implies the other person was notified. |"
L["| 6 |"] = f"| 6 | values-only / values-first | **{w('beset')} {w('bcha')}** / **{w('eset')}-{w('tekor')}** | {w('eset')} = value; both forms needed (adjective vs principle). |"
L["| 7 |"] = f"| 7 | verification photo | **{w('ymrgcha')} {w('foto')}** | {w('foto')} is the stable loan. Alt: {w('ymnnet')} {w('mrgcha')} {w('foto')} (longer). |"
L["| 8 |"] = f"| 8 | review / reviewer / administrator | **{w('gmema')} / {w('gamagi')} / {w('astedari')}** | \"Private review\" = **{w('yegl')} {w('gmema')}**; \"administrator review\" = **{w('astedari')} {w('gmema')}**. |"
L["| 9 |"] = f"| 9 | profile (public) / tab | **{w('megelecha')}** | Native term; tab label identical. Alt loan: {w('profayl')}. |"
L["| 10 |"] = f"| 10 | public code (KD-…) | **{w('yemegelecha')} {w('kod')}** | Ties the anonymous code to the public-profile concept. |"
L["| 11 |"] = f"| 11 | bio / about you | **{w('achr')} {w('yegl')} {w('megelecha')}** | The term itself sets the length expectation. |"
L["| 12 |"] = f"| 12 | the other participant | pronoun **{w('ersachew')}**; noun (first mention) **{w('twway')}** | {w('ersachew')} is honourific and gender-neutral — exactly right pre-reveal. Alt noun {w('agaro')} implies couplehood too early. |"
L["| 13 |"] = f"| 13 | Discover (tab) | **{w('fleka')}** | Tab-sized, carries the \"seeking\" sense. Alts: {w('asus')} (explore), {w('magnet')} (odd alone). |"
L["| 14 |"] = f"| 14 | swipe right / keep on shortlist | **{w('wd')} {w('qgn')} {w('yanshrttu')}** / **{w('wd')} {w('zrzro')} {w('yasgabu')}** | {w('manshratet')} is the established swipe verb; the second phrase states the meaning, not the gesture. |"
L["| 15 |"] = f"| 15 | request sent / accepted / declined | **{w('tyaqw')} {w('tlk')} / {w('tqbl')} / {w('tmls')}** | Decline = {w('tmls')} (\"turned away\", soft); never {w('wdq')} (harsh, bureaucratic) in user copy. |"
L["| 16 |"] = f"| 16 | accept / confirm (buttons) | **{w('yqblu')} / {w('yargtu')}** | Plural-polite imperatives. |"
L["| 17 |"] = f"| 17 | waiting for the other confirmation | **{w('ersachew')} {w('mrgcha')} {w('bmTbbq_lay')}** | Keeps the \"both must confirm\" symmetry explicit. |"
L["| 18 |"] = f"| 18 | introduction thread (restricted chat) | **{w('yetwwq')} {w('nggr')}** | \"The introduction conversation\"; avoids the loan {w('chat')}. Alt: {w('yetwwq')} {w('mdrk')}. |"
L["| 19 |"] = f"| 19 | pairing journey | **{w('yTSnd')} {w('gzo')}** | Keeps the product's journey metaphor; {w('yTSnd')} = pair. |"
L["| 20 |"] = f"| 20 | next step unlock | **{w('qTayw')} {w('ermja')} {w('mkfet')}** | \"The opening of the next step\"; gate metaphor without payment connotations. |"
L["| 21 |"] = f"| 21 | simultaneous reveal | **{w('abr')} {w('mgalet')}** | The verb {w('mgalet')} is reciprocal by form — mutual disclosure in one word. |"
L["| 22 |"] = f"| 22 | close respectfully | **{w('bakbro')} {w('yzgu')}** (noun: **{w('bakbro')} {w('mzgat')}**) | Dignified exit language, plural-polite. |"
L["| 23 |"] = f"| 23 | getting to know each other | **{w('ers_bers_mtwwq')}** | Reciprocal construction = exactly the product intent. |"
L["| 24 |"] = f"| 24 | pending / approved / rejected | **{w('bmTbbq_lay')} / {w('TSdq')} / {w('tmls')}** | {w('TSdq')} carries a fitting solemn weight; user-facing \"rejected\" stays the soft {w('tmls')} form ({w('wdq')} only in operator contexts). |"
L["| 25 |"] = f"| 25 | \"4 of 5 requests left today\" | **{w('zare')} {w('symqrut')} 4 {w('tyaqoch')}** | Amharic word order (remaining-first); digits retained. |"
L["| 26 |"] = f"| 26 | privacy / private | **{w('glawinet')} / {w('gl')}** | Standard. |"
L["| 27 |"] = f"| 27 | (explicit) consent / consent receipt | **({w('glT')}) {w('fqd')} / {w('yfqd')} {w('mzb')}** | Legally adequate for Proclamation 1321/2024 copy. |"
L["| 28 |"] = f"| 28 | contact details | **{w('ymgnya')} {w('mrja')}** | Covers phone, handles, links in one phrase. Alt: {w('ywqya')} {w('mrja')}. |"
L["| 29 |"] = f"| 29 | blocked / never shared | **{w('tklkll')} / {w('bfTum')} {w('aygram')}** | Factual safety voice, no alarmism. |"
L["| 30 |"] = f"| 30 | export your data / delete your data | **{w('whbwo')} {w('yawrdu')} / {w('whbwo')} {w('ysrzu')}** | \"Export\" rendered as *download* — what the button actually does; delete = {w('mserz')} (erase). |"
L["| 31 |"] = f"| 31 | encrypted / administrator-only | **{w('ytmstr')} / {w('astedari')} {w('bcha')}** | {w('mstr')} is the standard tech-Amharic verb for encrypt. |"
L["| 32 |"] = f"| 32 | photo purged 30 days after approval | **{w('fotow')} {w('TSdqw')} 30 {w('qnat')} {w('wst')} {w('ysrzal')}** | Keeps the promise explicit and dated. |"
L["| 33 |"] = f"| 33 | silent decline (\"no one is told\") | **{w('manm')} {w('aywqm')}** | Plain and reassuring; the literal long form is too heavy for chips. |"
L["| 34 |"] = f"| 34 | Begin / Continue / Submit for review | **{w('yjmrw')} / {w('yqTlu')} / {w('lgmema')} {w('yasgabu')}** | The register markers users feel first. |"
L["| 35 |"] = f"| 35 | Sign in / Signed in / Sign out | **{w('yjbu')} / {w('gbtwal')} / {w('ywTu')}** | The middle form reads as a state (\"you are in\"). |"
L["| 36 |"] = f"| 36 | Save / Retry / Back / Close | **{w('yasqmu')} / {w('endgna')} {w('ymkru')} / {w('tms')} / {w('yzgu')}** | One consistent plural-polite verb set. |"
L["| 37 |"] = f"| 37 | error voice, e.g. \"We couldn't save your progress.\" | **{w('hdton')} {w('masqmet')} {w('alchlnm')}. {w('ebakwo')} {w('endgna')} {w('ymkru')}.** | First-person-plural ownership + polite retry; never blame the user. |"
L["| 38 |"] = f"| 38 | greeting / message | **{w('slmta')} / {w('mlkt')}** | \"Send a brief, values-centred greeting\" → **{w('achr')}, {w('eset')}-{w('tekor')} {w('slmta')} {w('ylku')}.** |"
L["| 39 |"] = f"| 39 | Orthodox Christian / Tewahedo | **{w('ortodoks')} {w('twhdo')} {w('krstyan')}** | The community's own spelling is {w('twhdo')}; shorter variants are treated as errors. |"
L["| 40 |"] = f"| 40 | faith & family | **{w('emntna')} {w('btsb')}** | Contracted conjunction reads naturally in headings. |"
L["| 41 |"] = f"| 41 | parish / church community | **{w('sbkt')} {w('gbI')} / {w('ybt')} {w('krstyan')} {w('mhbrsb')}** | {w('sbkt')} {w('gbI')} is the parish territory; the longer phrase gives the community sense. |"
L["| 42 |"] = f"| 42 | intentional (\"Intentional, not endless\") | **{w('bealma')} — {w('ymyalq')} {w('fleka')} {w('aydlm')}.** | Keeps the slogan's contrast without loanwords. |"
L["| 43 |"] = f"| 43 | pilot / preview deployment | **{w('pilot')} / {w('qdm_eyta')}** | {w('pilot')} is standard loan in Ethiopian tech/government usage. |"
L["- Loans only"] = f"- Loans only where no stable native term exists: {w('foto')}፣ {w('pilot')}፣ {w('kod')}። Telegram = **{w('tegram')}** in prose, \"Telegram\" in brand contexts."

path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "docs", "i18n-glossary-am.md")
lines = open(path).read().split("\n")
n = 0
for i, l in enumerate(lines):
    for pre, new in L.items():
        if l.startswith(pre):
            lines[i] = new
            n += 1
            break
open(path, "w").write("\n".join(lines))
print("glossary regenerated:", n, "lines")
