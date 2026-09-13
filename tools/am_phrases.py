#!/usr/bin/env python3
"""Amharic phrase specs for every UI key (natural keys = English source).

Each value is a space-separated syllable spec compiled by eth_spec.am():
  - word specs ("yE qA bA lu"), vocabulary names (resolved via VOC),
  - "~" = space, "." = ።, digits/Latin/punctuation pass through,
  - "{name}" placeholders are interpolated at runtime.
Syllable vowel orders: A=ä(1) u=2 i=3 a=4 e=5 E=ə(6) o=7.
Regenerate the catalog: python3 tools/gen_am.py
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from eth_spec import W, am  # noqa: E402

VOC = dict(W)
VOC.update({
    # common words (derived per syllable)
    "awo": "aA wO",                 # አዎ yes
    "ena": "aE na",                 # እና and
    "qwnqwa": "kWa nE kWa",         # ቋንቋ language
    "yadsu": "ya dE su",            # ያድሱ refresh
    "Eyetchane": "aE yE tA cha nE", # እየተጫነ (is) loading
    "bmchanlay": "bA mA cha nE ~ la yE",   # በመጫን ላይ
    "EyefsHn": "aE yE fA TE shE nE",       # እየፈተሽን (we are) checking
    "rqiq": "rE qI qE",             # ረቂቅ draft
    "rqiqwon": "re qI qE wO nE",    # ረቂቅዎን your draft (acc.)
    "huneta": "hU ne ta",           # ሁኔታ status
    "hunetawn": "hU ne ta wE nE",   # ሁኔታውን the status (acc.)
    "twwqwon": "tE wE wE qE wO nE", # ትውውቅዎን your introduction (acc.)
    "twwqoch": "tE wE wE qO kE",   # ትውውቆች introductions
    "twwqochn": "tE wE wE qO kE nE",      # ትውውቆችን (acc.)
    "tyaqochn": "TE ya QA wO kE nE",      # ጥያቄዎችን (acc.)
    "gnytochn": "gE nE nyU nA tO kE nE",  # ግንኙነቶችን (acc.)
    "guzown": "gu zO wE nE",        # ጉዞውን the journey (acc.)
    "tetnqwal": "tA TA na kWa lE",       # ተጠናቀዋል are complete
    "Tqyt": "TE qI tE",
    "mhbrsbna": "ma hE bA rA sA bE na",  # ማህበረሰብና
    "fkd": "fA qa dE",                 # ፈቃድ
    "fkdna": "fA qa dE na",            # ፈቃድና             # ጥቂት few
    "astwldwot": "aA sE tE wU lE wO tE",   # አስተውልዎት thoughtfulness
    "tnsh": "tE nE shE",            # ትንሽ small
    "yElet": "yA a2E lA tE",        # የዕለት daily
    "sbsb": "sE bE sE bE",          # ስብስብ set
    "flgawn": "fE lA ga wE nE",     # ፍለጋውን discovery (acc.)
    "blama": "bA aA la ma",         # በአላማ purposefully
    "ydzotal": "yE zO ta lE",       # ይዞታል keeps
    "adis": "aA dI sE",          # አዲስ new
    "yeTSdqwoch": "yE TSA dA qU",   # የጸደቁ approved (pl.)
    "mgechawoch": "mA gA lA cha wO kE",   # መገለጫዎች profiles
    "ezh": "aE zI hE",              # እዚህ here
    "ytayalu": "yE ta ya yu lE",    # ይታያሉ will appear
    "alTTyqam": "aA lE tA TA ya qA mE",    # አልተጠየቀም not asked
    "amet": "a2a mA tE",            # ዓመት year
    "Itiopia": "aI tE yO TPE ya",   # ኢትዮጵያ Ethiopia
    "wndm": "wA nE dE mE",          # ወንድም brother
    "hEt": "aE hE tE",              # እህት sister
    "wnd": "wA nE dE",              # ወንድ male/man
    "set_": "se tE",                # ሴት female/woman
    "santimetr": "sa nE tI me tE rE",      # ሳንቲሜትር cm
    "kidane_mhret": "ki da ne ~ mE hE rA tE",  # ኪዳነ ምህረት
    "ymlsu": "yE mA lE sU",         # ይመልሱ decline (send back, polite)
    "bzgta": "bA zE gE ta",         # በዝግታ quietly
    "engliznya": "aE nE gE lI zE nya",     # እንግሊዝኛ English
    "waym": "wA yE mE",             # ወይም or
    "bzeh": "bA zI hE",             # በዚህ on this
    "mesarya": "mA sa rI ya",       # መሣሪያ device
    "lay": "la yE",                 # ላይ on
    "yqmetal": "yE qA mA TA lE",    # ይቀመጣል is saved
    "twwqochnE": "yA tE wE wE qO kE wO nE",  # የትውውቆችዎን your introductions (acc.)
})

def P(*items: str) -> str:
    """Join vocabulary names / raw specs / literals into one compilable spec."""
    out = []
    for it in items:
        out.append(" ".join(VOC.get(tok, tok) for tok in it.split(" ")))
    return " ".join(out)

AM: dict[str, str] = {}

# ============================================================ batch 1: common
AM.update({
    "Accept": P("yqblu"),
    "Decline": P("ymlsu"),
    "Decline request quietly": P("tyaqw", "nE", "~", "bzgta", "~", "ymlsu"),
    "Confirm": P("yargtu"),
    "Continue": P("yqTlu"),
    "Begin": P("yjmrw"),
    "Back": P("tms"),
    "Close": P("yzgu"),
    "Exit": P("ywTu"),
    "Send": P("ylku"),
    "Send request": P("tyaq", "~", "ylku"),
    "Save": P("yasqmu"),
    "Retry": P("endgna", "~", "ymkru"),
    "Refresh": P("yadsu"),
    "Refresh status": P("hunetawn", "~", "yadsu"),
    "Loading": P("Eyetchane", "…"),
    "Loading requests": P("tyaqochn", "~", "bmchanlay"),
    "Loading connections": P("gnytochn", "~", "bmchanlay"),
    "Loading journey": P("guzown", "~", "bmchanlay"),
    "Loading your draft…": P("rqiqwon", "~", "bmchanlay", "…"),
    "Loading your introduction…": P("twwqwon", "~", "bmchanlay", "…"),
    "Loading today’s introductions…": P("yA", "zare", "~", "twwqochn", "~", "bmchanlay", "…"),
    "Checking your introductions…": P("twwqochnE", "~", "EyefsHn", "…"),
    "Today’s introductions are complete": P("yA", "zare", "~", "twwqoch", "~", "tetnqwal"),
    "Thoughtful, not endless.": P("Tqyt", ",", "gE nE", "~", "blama", "."),
    "A small daily set keeps discovery intentional. New approved profiles will appear here.":
        P("tnsh", "~", "yElet", "~", "sbsb", "~", "flgawn", "~", "blama", "~", "ydzotal", ".", "~",
          "adis", "~", "yeTSdqwoch", "~", "mgechawoch", "~", "ezh", "~", "ytayalu", "."),
    "Yes": P("awo"),
    "No": P("aydlm"),
    "Not asked": P("alTTyqam"),
    "yrs": P("amet"),
    "{n} yrs": P("{n}", "~", "amet"),
    "Ethiopia": P("Itiopia"),
    "Brother": P("wndm"),
    "Sister": P("hEt"),
    "Male": P("wnd"),
    "Female": P("set_"),
    "Man": P("wnd"),
    "Woman": P("set_"),
    "cm": P("santimetr"),
    "and": P("ena"),
    "Language": P("qwnqwa"),
    "Kidan": "Kidan",
    "Kidane Mihret": P("kidane_mhret"),
    "English or Amharic — saved on this device.":
        P("engliznya", "~", "waym", "~", "amharnya", "~", "—", "~", "bzeh", "~", "mesarya", "~", "lay", "~", "yqmetal", "."),
})


# ============================================================ batch 2a: cities/status/discover
AM.update({
    "Addis Ababa": P("adis", "~", "aA bA ba"),
    "Adama": P("aA dA ma"),
    "Bahir Dar": P("ba hE rE", "~", "dA rE"),
    "Debre Birhan": P("dA bE rE", "~", "bE rE hA nE"),
    "Dire Dawa": P("dE re", "~", "dA wa"),
    "Approved": P("TSdqw"),
    "Declined": P("tA mA lE sW lE"),
    "Active": P("nE qu"),
    "Anonymous": P("sE mE - aA lE ba"),
    "Anonymous discovery": P("sE mE - aA lE ba", "~", "fleka"),
    "Anonymous in discovery": P("bA fE lA ga", "~", "wE sE TE", "~", "sE mE - aA lE ba"),
    "Anonymous profile": P("sE mE - aA lE ba", "~", "megelecha"),
    "Anonymous discovery publication": P("sE mE - aA lE ba", "~", "yA fE lA ga", "~", "ma qE rA bE"),
    "Anonymity by design": P("mA nE nA tE", "~", "bA nE dE fE", "~", "yA tA dA bA qA"),
    "Almost there": P("Tqyt", "~", "qA rE tW lE"),
    "At a glance": P("bA aA nE dE", "~", "aE yE ta"),
    "Admin verified": P("bA astedari", "~", "yA tA rA ga gA TA"),
    "Admin verification only": P("lA astedari", "~", "mrgcha", "~", "bcha"),
    "Candidate verification photo": P("yA aE chU", "~", "mrgcha", "~", "foto"),
    "Added to your private shortlist": P("wd", "~", "yegl", "~", "mrcha", "~", "zrzro nE", "~", "ta kE lW lE"),
    "Passed privately": P("bA sE wE rE", "~", "tA la lE fW lE"),
    "Back to connections": P("wd", "~", "gnytoch", "~", "tms"),
    "Close profile": P("megelecha wE nE", "~", "yzgu"),
    "Closed with care": P("bakbro", "~", "tA zA gE tW lE"),
    "City": P("kA tA ma"),
    "Broad field": P("sA fi", "~", "zA rE fE"),
    "Community": P("mhbrsb"),
    "Community and safety rules": P("yA mhbrsbna", "~", "yA dA hE nE nA tE", "~", "dA nE bO kE"),
})
# ============================================================ batch 2b/2c: preview + onboarding
AM.update({
    "Primary navigation": P("wa na", "~", "aA sa sa"),
    "Discover": P("fleka"),
    "Connections": P("gnytoch"),
    "Profile": P("megelecha"),
    "Preview": P("qdm_eyta"),
    "Limited preview": P("yA tA gA dA bA", "~", "qdm_eyta"),
    "Preview only": P("qdm_eyta", "~", "bcha"),
    "Your draft is saved": P("rqiq wO", "~", "tA qA mE gE tW lE"),
    "Your public draft was transmitted and saved": P("yA HE zE bE", "~", "rqiq wO", "~", "tA lE kWa lE na", "~", "tA qA mE gE tW lE"),
    "Your public draft has not been saved yet": P("yA HE zE bE", "~", "rqiq wO", "~", "gA na", "~", "aA lE tA qA mA TA mE"),
    "In this preview you can sign in and save your public profile sections. Private identity, verification, submission, administrator review, discovery, and connections are not enabled yet.":
        P("bA zI hE", "~", "qdm_eyta", "~", "mA gE ba tE na", "~", "yA HE zE bE", "~", "megelecha", "~",
          "kE fE lO kE wO nE", "~", "ma sE qA mE TE", "~", "yE CHE la lu", ".", "~",
          "yA gl", "~", "ma nE nA tE", ",", "~", "mrgcha", ",", "~", "ma sE gA bI ya", ",", "~",
          "yA astedari", "~", "gmema", ",", "~", "fleka na", "~", "gnytoch", "~", "gA na", "~",
          "aA lE nA qu mE", "."),
    "Verification, consent, and review remain disabled in this preview.":
        P("mrgcha", ",", "~", "fkdna", "~", "gmema", "~", "bA zI hE", "~", "qdm_eyta", "~", "aA lE nA qu mE", "."),
    "Complete your full name, date of birth, and phone number.":
        P("mu lu", "~", "sE mE wO nE", ",", "~", "yA lE dA tE", "~", "qA nE wO na", "~",
          "sE lE kE", "~", "qU TE rE wO nE", "~", "yE mu lu", "."),
    "Choose at least three values and write a short introduction of 20–280 characters.":
        P("bI ya nE sE", "~", "SAo sE tE", "~", "aE se tO kE nE", "~", "yE mE rA TU na", "~",
          "kA 20 - 280", "~", "fi dA la tE", "~", "aA chE rE", "~", "megelecha", "~", "yE TSa fu", "."),
    "Confirm all three eligibility requirements to continue.":
        P("lA mA qA TA lE", "~", "SAo sE tu nE mE", "~", "yA bE qa tE", "~", "mA sA fA rE tO kE", "~",
          "ya rA ga gE TU", "."),
    "Complete the required public-profile fields before continuing.":
        P("lA mA qA TA lE", "~", "yA mi ya sE fA lE gu tE nE", "~", "yA HE zE bE", "~", "megelecha", "~",
          "mA sE kO kE", "~", "yE mu lu", "."),
    "A small change is needed before your profile can be published":
        P("megelecha wO", "~", "lA HE zE bE", "~", "kA mA qE rA bu", "~", "bA fI tE", "~", "tE nE shE", "~",
          "ma sE tA ka kA ya", "~", "ya sE fA lE ga lE"),
    "An administrator asked for a small change before your profile can be published. Review the private note below and resubmit.":
        P("astedari", "~", "megelecha wO", "~", "lA HE zE bE", "~", "kA mA qE rA bu", "~", "bA fI tE", "~", "tE nE shE", "~",
          "lA wE TE", "~", "TA yE kWa lE", ".", "~", "bA ta CHE", "~", "ya lA wO nE", "~", "yA gl", "~",
          "ma sE ta wa sha", "~", "yE mA lE kA tu na", "~", "endgna", "~", "yasgabu", "."),
    "Are you ready for the next step?":
        P("lA qA Ta yu", "~", "dA rA ja", "~", "zE gE ju", "~", "nA wO tE", "?"),
    "Are you absolutely sure? Your account cannot be restored.":
        P("bA aE rE gE TA nyE nA tE", "~", "nA wE", "?", "~", "mA lA ya wO", "~", "lI mA lA sE", "~",
          "aA yE CHE lE mE", "."),
    "Both people choose independently.":
        P("hU lA tu mE", "~", "sA wO kE", "~", "bA nA TSa", "~", "yE mA rE Ta lu", "."),
    "Both people choose to proceed again.":
        P("hU lA tu mE", "~", "sA wO kE", "~", "endgna", "~", "lA mA qA TA lE", "~", "yE mA rE Ta lu", "."),
    "Choose compatibility, not a ranking.":
        P("tA sE ma mI nA tE nE", "~", "yE mE rA TU", "~", "aE nE jI", "~", "dA rA ja", "~", "aA yE dA lA mE", "."),
    "Describe the life you hope to build.":
        P("lI gA nA bu tE", "~", "yA mi fA lE gu tE nE", "~", "qnat", "~", "yE gE lA TSu", "."),
    "Accept every required consent. Bot notifications remain optional.":
        P("hU lu nE mE", "~", "aA sE fA la gI", "~", "fA qa dO kE nE", "~", "yqblu", ".", "~",
          "yA bO tE", "~", "ma sa wA qI ya", "~", "gE nE", "~", "aA ma ra CHE", "~", "nA wE", "."),
})

# ============================================================ batch 3a: intro copy / admin review / consent
AM.update({
    "+251 …": "+251 …",
    "165": "165",
    "A JSON copy of your profile, identity, photo, and consents.":
        P("yA megelecha , ~ ma nE nA tE , ~ fO tO na ~ fA qa dO kE ~ yA JSON ~ qE jI ."),
    "A gentle note": P("lA sE la sa", "~", "ma sE ta wa sha"),
    "A private hello": P("yegl", "~", "slmta"),
    "A private path to intentional marriage.":
        P("wd", "~", "blama", "~", "ga bE CHa", "~", "yA mi wA sE dE", "~", "yegl", "~", "mA nE gA dE", "."),
    "A quiet moment to reflect — ready, not yet, or a respectful close are all honest answers.":
        P("yA mA sA la sA lE ~ gI ze ~ — ~ zE gE ju ~ mA hO nE , ~ gA na ~ aA lA mA hO nE ~ waym",
          "~ bakbro ~ mA zE ga tE ~ hU lu mE ~ qE nE ~ mA lE sO kE ~ na CHe wE ."),
    "A request is a deliberate step from your private shortlist. You can send up to {cap} a day. Requests expire after 72 hours, and no one is told if they are declined.":
        P("tyaq ~ kA gl ~ mrcha ~ zrzro ~ yA tA nA dA fA ~ aE rE mE ja ~ nA wE .",
          "~ bA qA nE ~ aE sE kA ~ {cap} ~ mA la kE ~ yE CHE la lu .",
          "~ tyaqoch ~ bA 72 ~ sA a2a ta tE ~ ya bA qa lu , ~ kA tA mA lA sA ~ gE nE ~ manm ~ aA yE nA gA rE mE ."),
    "A restricted in-app introduction is available. Contact details stay private by design.":
        P("yA tA gA dA bA ~ bA mA tA gE bE rI ya ~ wst ~ twwq ~ yE gA nya lE .",
          "~ yA mA gA na nya ~ mA rA ja ~ bA nE dE fE ~ gE la wI ~ hO nO ~ yE qO ya lE ."),
    "A right swipe is private and never tells anyone. Sending a request is the committed step — {age}, {gender}, {city} ({code}) will see your values-only summary and can accept or quietly decline.":
        P("yA qA nyE ~ mA da sA sE ~ gE la wI ~ nA wE , ~ lA manm ~ aA yE nA gE rE mE .",
          "~ tyaq ~ mA la kE ~ yA tA rA ga gA TA ~ aE rE mE ja ~ nA wE ~ — ~ {age} , ~ {gender} , ~ {city}",
          "~ ( {code} ) ~ bealma ~ bcha ~ ma TA qa la ya wO nE ~ ya ya lu , ~ mA qA bA lE ~ waym ~ bzgta ~ mA mA lA sE ~ yE CHE la lu ."),
    "Accepted — waiting on confirmations":
        P("tA qA bE lA wa lE ~ — ~ mrgcha wO kE nE ~ bA mA TA ba bA qE ~ lay"),
    "Account unavailable": P("mA lA ya wE", "~", "aA yE gA nyE mE"),
    "Active faith": P("nE qu", "~", "aE mE nA tE"),
    "Active in church service": P("bA be tA", "~", "krstyan", "~", "aE gA lE gE lO tE", "~", "nE qu"),
    "Age range, accepted locations, marital/children preferences, and desired values are used to create a compatible deck—not shown as a public checklist.":
        P("yA a2E dE mE ~ kE lE lE , ~ yA tA qA bA lO kE wE ~ aA ka ba bI wO kE ,",
          "~ yA ga bE CHa na ~ lE jO kE ~ mE rE cha wO kE , ~ yA tA fA la gu ~ aE se tO kE",
          "~ — ~ tA sE ma mI ~ zrzr ~ lA mA SAE ra tE ~ yE TA qA ma lu , ~ bA HE zE bE ~ aA yE ta yu mE ."),
    "An administrator approved this introduction. Confirm when you are ready to proceed.":
        P("astedari ~ yE hE nE ~ twwq ~ TSdqw . ~ lA mA qA TA lE ~ zE gE ju ~ sI hO nu ~ ya rA ga gE TU ."),
    "An administrator is privately verifying your identity and reviewing your public profile. You will be notified here when it is approved. Your name, phone, photo, and contact details stay hidden throughout.":
        P("astedari ~ ma nE nA tE wO nE ~ bA sE wE rE ~ aE ya rA ga gA TA na ~ yA HE zE bE ~ megelecha wO nE ~ aE yA gA mA gA mA ~ nA wE .",
          "~ sI TS dE qE ~ aE zI hE ~ yE nA gA rE wO ta lE .",
          "~ sE mE wO , ~ sE lE kE wO , ~ fO tO wO na ~ yA mA gA na nya ~ mA rA ja wO ~ hU lu mE ~ gI ze ~ yA tA dA bA qu ~ hO nA wE ~ yE qO ya lu ."),
    "An administrator is privately verifying your identity and reviewing your public profile. You will be notified here.":
        P("astedari ~ ma nE nA tE wO nE ~ bA sE wE rE ~ aE ya rA ga gA TA na ~ yA HE zE bE ~ megelecha wO nE ~ aE yA gA mA gA mA ~ nA wE .",
          "~ aE zI hE ~ yE nA gA rE wO ta lE ."),
    "An administrator will privately verify your identity and review your public profile. You will be notified here. Your name, phone, photo, and contact details stay hidden throughout discovery.":
        P("astedari ~ ma nE nA tE wO nE ~ bA sE wE rE ~ ya rA ga gE Ta lE , ~ yA HE zE bE ~ megelecha wO nE mA ~ yE gA mA gE ma lE .",
          "~ aE zI hE ~ yE nA gA rE wO ta lE .",
          "~ sE mE wO , ~ sE lE kE wO , ~ fO tO wO na ~ yA mA gA na nya ~ mA rA ja wO ~ bA fE lA ga ~ wA qE tE ~ hU lu ~ yA tA dA bA qu ~ hO nA wE ~ yE qO ya lu ."),
    "An in-app introduction opens first — never a name, phone, or Telegram link.":
        P("mA jA mA rI ya ~ bA mA tA gE bE rI ya wE ~ wst ~ twwq ~ yE kA fA ta lE ~ —",
          "~ sE mE , ~ sE lE kE ~ waym ~ yA Telegram ~ mA gA na nya ~ bA fE TSu mE ~ aA yE sA TE mE ."),
})

# ============================================================ batch 3b: deletion/demo/discovery/eligibility
AM.update({
    "Couldn’t send the request just now.": P("tyaqw nE ~ aA lE tA la kA mE ~ ."),
    "Daily limit reached — you can send more requests tomorrow.":
        P("yA qA nE ~ gA dA bE ~ dA rE sW lE ~ — ~ nA gA ~ tA ch ma rI ~ tyaqoch ~ mA la kE ~ yE CHE la lu ~ ."),
    "Data export and deletion become available when submissions are enabled. During this prototype, no personal data leaves your device.":
        P("ma sE gA bI ya wO kE ~ sI nA qu ~ yA mA rA ja ~ ma wE Ta tE na ~ ma TE fa tE ~ yE gA nya lu ~ .",
          "~ bA zI hE ~ na mu na ~ wA qE tE ~ mE nE mE ~ yA gl ~ mA rA ja ~ kA mA sa rI ya wO ~ aA yE wA Ta mE ~ ."),
    "Deacon": P("dI qu nE"),
    "Decline introduction": P("twwq wO nE ~ mA mA lA sE"),
    "Declining is silent — they simply won’t hear back. Accepting lets both of you confirm before an administrator reviews.":
        P("mA mA lA sE ~ zE mE ta ~ nA wE ~ — ~ aE sa CHA wE ~ mE la shE ~ aA yE sA ma mE ~ .",
          "~ mA qA bA lE ~ gE nE ~ astedari ~ gE mE gA ma ~ kA ma dA rA gu ~ bA fI tE ~ hU lA ta kE hU mE ~ aE nE dE ta rA ga gE TU ~ ya dA rE ga lE ~ ."),
    "Delete my account": P("mA lA ya yE nE ~ aA TE fa"),
    "Delete your Kidan account and all your data? This permanently removes your profile, identity details, verification photo, and review history. This cannot be undone.":
        P("yA Kidan ~ mA lA ya wO na ~ mA rA ja wO nE ~ hU lu ~ ma TE fa tE ~ yE fA lE ga lu ~ ?",
          "~ yE hE ~ megelecha wO nE ~ , ~ yA ma nE nA tE ~ mA rA ja wO nE ~ , ~ yA mrgcha ~ fO tO na ~ yA gmema ~ ta rI kE ~ bA kWa mI nA tE ~ ya TE fa lE ~ .",
          "~ yE hE ~ lI qA lA bA sE ~ aA yE CHE lE mE ~ ."),
    "Deleting…": P("bA ma TE fa tE ~ lay ~ …"),
    "Deletion failed. Please try again.": P("ma TE fa tu ~ aA lE tA SAa ka mE ~ . ~ ebakwo ~ endgna ~ ymkru ~ ."),
    "Demo": P("na mu na"),
    "Demo preview — synthetic, local-only. No data is sent or saved.":
        P("yA na mu na ~ qdm_eyta ~ — ~ mA rA ja ~ sA wE ~ sA ra shE na ~ bA aA ka ba bI ~ bcha ~ nA wE ~ .",
          "~ mE nE mE ~ aA yE la kA mE ~ , ~ aA yE qA mE TE mE ~ ."),
    "Diploma": P("dI pE lO ma"),
    "Discovery is values-only.": P("fleka ~ bealma ~ bcha ~ nA wE ~ ."),
    "Discovery is values-only. Your name, phone, and date of birth are encrypted and visible only to an administrator verifying your identity.":
        P("fleka ~ bealma ~ bcha ~ nA wE ~ . ~ sE mE wO ~ , ~ sE lE kE wO na ~ yA lE dA tE ~ qA nE wO ~ tA mA sE TA rE wE",
          "~ ma nE nA tE wO nE ~ lA mi ya rA ga gE TE ~ astedari ~ bcha ~ yE ta ya lu ~ ."),
    "Discovery preferences": P("yA fleka ~ mE rE cha wO kE"),
    "Do not include phone numbers, usernames, or links in partner preferences.":
        P("bA aA ga rE ~ mE rE cha wO kE ~ wst ~ sE lE kE ~ qU TE rO kE nE ~ , ~ yA tA TA qa mI ~ sE mA wO kE nE ~ waym",
          "~ mA gA na nya wO kE nE ~ aA yE ch mE ru ~ ."),
    "Doctorate": P("dO kE tE rE tE"),
    "Does not plan to have children": P("lE jO kE ~ lA mA wE lA dE ~ aA ya qE dE mE"),
    "Download my data": P("mA rA ja yE nE ~ aA wE rE dE"),
    "Draft saved": P("rqiq ~ tA qA mE gE tW lE"),
    "Education": P("tE mE hE rE tE"),
    "Eligibility": P("bE qa tE"),
    "Eligibility and safety checks.": P("yA bE qa tE na ~ yA dA hE nE nA tE ~ ma Ta rI ya wO kE ~ ."),
    "Employed": P("SA ra tA nya"),
    "Employment": P("SAE ra"),
    "Encrypting & uploading…": P("bA mA mA sE TA rE na ~ bA mA cha nE ~ lay ~ …"),
    "Enter the demo app": P("wd ~ na mu na ~ mA tA gE bE rI ya wE ~ yE gE bu"),
    "Ethiopian Orthodox Tewahedo": P("Itiopia ~ ortodoks ~ twhdo"),
    "Every profile is privately reviewed.": P("aE ya nE da nE du ~ megelecha ~ bA gl ~ yE gA mA gE ma lE ~ ."),
    "Everything on this page may appear in discovery.":
        P("bA zI hE ~ gA TSE ~ lay ~ ya lA ~ nA gA rE ~ hU lu ~ bA fE lA ga ~ lI ta yE ~ yE CHE la lE ~ ."),
    "Exit onboarding": P("kA mzgat ~ ywTu"),
    "Explore demo": P("na mu na wO nE ~ ya sE su"),
    "Express interest privately": P("fE la gO tE wO nE ~ bA sE wE rE ~ yE gE lA TSu"),
    "Faith & family": P("aE mE nA tE na ~ btsb"),
    "Faith & intention": P("aE mE nA tE na ~ a2a la ma"),
    "Faith-data processing": P("yA aE mE nA tE ~ mA rA ja ~ aA ya ya zE"),
    "Family status": P("yA btsb ~ huneta"),
    "Family-oriented": P("btsb ~ - ~ tekor"),
    "Feedback & help": P("aA sE tA ya yE tE na ~ aE rE da ta"),
    "Fill sample": P("na mu na ~ yE mu lu"),
    "Final confirmation": P("yA mA ch rA sha ~ mrgcha"),
    "Founding cohort": P("mA sE ra CHE ~ bu dE nE"),
    "Full name, phone, date of birth, Telegram identity, and verification photo.":
        P("mu lu ~ sE mE ~ , ~ sE lE kE ~ , ~ yA lE dA tE ~ qA nE ~ , ~ yA Telegram ~ ma nE nA tE na ~ yA mrgcha ~ fO tO ~ ."),
    "Future children": P("yA wA da fi tE ~ lE jO kE"),
    "Gender": P("TSO ta"),
    "Generic bot notifications": P("aA TA qa la yE ~ yA bO tE ~ ma sa wA qI ya wO kE"),
    "Getting to know each other": P("aE rE sE ~ bA aE rE sE ~ mA tA wa wA qE"),
    "Godfather": P("yA mE nE fA sa wI ~ aA bA tE"),
    "Has children": P("lE jO kE ~ aA lu tE"),
    "Hawassa": P("HA wa sa"),
    "Height": P("qU mA tE"),
    "Honesty": P("qE nE nA tE"),
    "How Kidan handles your data": P("Kidan ~ mA rA ja wO nE ~ aE nE dE tE ~ yE yE za lE"),
    "How a connection opens": P("gnyt ~ aE nE dE tE ~ yE kA fA ta lE"),
    "I am Ethiopian Orthodox Tewahedo": P("Itiopia ~ ortodoks ~ twhdo ~ nA nyE"),
    "I am aged 21–45": P("a2E dE mE yE ~ 21 - 45 ~ nA wE"),
})

# ============================================================ batch 3c: contact/review/intro/errors/values
AM.update({
    "Bachelor’s degree": P("yA mA jA mA rI ya ~ dI gE rI"),
    "Certificate": P("sA rE tA fE ke tE"),
    "Check your connection and try again.": P("gnyt wO nE ~ yA rA ga gE TU na ~ endgna ~ ymkru ~ ."),
    "Checking your journey…": P("gu zO wO nE ~ bA mA mA rE mA rE ~ lay ~ …"),
    "Closing a pairing is always possible and always kind. Identities are revealed only through the shared reveal, and shown only when you deliberately ask.":
        P("ma Ta mA rE nE ~ mA zE ga tE ~ hU lE gI ze ~ yE CHa la lE ~ , ~ hU lE gI ze mE ~ bA aE kE bE rO tE ~ nA wE ~ .",
          "~ ma nE nA tE wO kE ~ yA mi gE lA TSu tE ~ bA ga ra ~ sE mE mE nA tE ~ bcha ~ nA wE ~ ,",
          "~ yA mi ta yu tE mE ~ aE rE sE wO ~ bA aA la ma ~ sI TA yE qu ~ bcha ~ nA wE ~ ."),
    "Communication": P("gnyt"),
    "Compassion": P("rE HHE ra HHe"),
    "Confirming…": P("bA mA rA ga gE TE ~ lay ~ …"),
    "Connecting…": P("bA mA gA na nya TE ~ lay ~ …"),
    "Connection error": P("yA gnyt ~ sE hE tA tE"),
    "Consent": P("fkd"),
    "Contact details are only shared after mutual interest, administrator approval, and both people's confirmation.":
        P("yA mA gA na nya ~ mA rA ja wO kE ~ yA mi ga ru tE ~ bA aE rE sE ~ bA aE rE sE ~ fE la gO tE ~ ,",
          "~ astedari wE ~ kA TS dA qA na ~ hU lA tu mE ~ sA wO kE ~ kA ya rA ga gE TU na ~ bA HWa la ~ bcha ~ nA wE ~ ."),
    "Contact details are revealed only through a separate, future consent step — never in the pilot introduction.":
        P("yA mA gA na nya ~ mA rA ja wO kE ~ yA mi gE lA TSu tE ~ bA tA lA ya na ~ bA wA da fI tE ~ bA mi nO rE",
          "~ yA fA qa dE ~ dA rA ja ~ bcha ~ nA wE ~ — ~ bA pa yE la tE ~ twwq ~ wst ~ bA fE TSu mE ~ aA yE dA lA mE ~ ."),
    "Continue to welcome": P("wd ~ aE nE kWa nE ~ dA hE na ~ mA TU ~ yE qA TE lu"),
    "Could not load your draft": P("rqiq wO nE ~ mA CHa nE ~ aA lE tA CHa lA mE"),
    "Could not reach the service. Please try again.":
        P("aA gA lE gE lO tu nE ~ ma gE nyE tE ~ aA lE tA CHa lA mE ~ . ~ ebakwo ~ endgna ~ ymkru ~ ."),
    "Could not reload the latest draft. Try again.":
        P("yA qE rE bE ~ gI ze wO nE ~ rqiq ~ endgna ~ mA CHa nE ~ aA lE tA CHa lA mE ~ . ~ endgna ~ ymkru ~ ."),
    "Could not send. Try again.": P("mA la kE ~ aA lE tA CHa lA mE ~ . ~ endgna ~ ymkru ~ ."),
    "I am seeking an intentional marriage": P("bA aA la ma ~ yA tA qa dA ~ ga bE CHa ~ aE fA lE ga lA hu"),
    "I'm ready to meet them": P("lA mA gA na nya TE ~ zE gE ju ~ nA nyE"),
    "INTERESTED": P("fE la gO tE"),
    "Identities revealed": P("ma nE nA tE wO kE ~ tA gE lA TSu"),
    "Identity privately verified": P("bA sE wE rE ~ yA tA rA ga gA TA ~ ma nE nA tE"),
    "Identity verified privately": P("bA sE wE rE ~ yA tA rA ga gA TA ~ ma nE nA tE"),
    "In private review": P("bA gl ~ gE mE gA ma ~ lay"),
    "In their words": P("bA aE sa CHA wE ~ qa la tE"),
    "In this preview, only your public profile sections are saved. Submission, identity verification, and administrator review are not enabled.":
        P("bA zI hE ~ qdm_eyta ~ yA HE zE bE ~ megelecha ~ kE fE lO kE wO ~ bcha ~ nA wE ~ yA mi qA mA TU tE ~ .",
          "~ ma sE gA ba tE ~ , ~ yA ma nE nA tE ~ ma rA ga gA TE na ~ yA astedari ~ gE mE gA ma ~ aA lE nA qu mE ~ ."),
    "Incoming requests": P("gA bI ~ tyaqoch"),
    "Intentional": P("blama"),
    "Intentional, not endless": P("blama ~ , ~ lA zA lA lA mE ~ aA yE dA lA mE"),
    "Interest stays private. No message or identity is shared unless interest is mutual, an admin approves, and both people confirm.":
        P("fE la gO tE ~ bA sE wE rE ~ yE qO ya lE ~ . ~ mE nE mE ~ mA lE aE kE tE ~ waym ~ ma nE nA tE ~ yA mi ga ra wE",
          "~ fE la gO tu ~ bA hU lA tu mE ~ bA ku lE ~ sI hO nE ~ , ~ astedari wE ~ sI TS dE qE na ~ hU lA tu mE ~ sA wO kE ~ sI ya rA ga gE TU ~ bcha ~ nA wE ~ ."),
    "Introduction": P("twwq"),
    "Introduction accepted — confirm with them next.":
        P("twwq ~ tA qA bE lA wa lE ~ — ~ qA TE lO ~ kA aE sa CHA wE ~ ga rE ~ ya rA ga gE TU ~ ."),
    "Introduction open": P("twwq ~ kE fE tE"),
    "Introduction request sent — you’ll see it if they accept.":
        P("yA twwq ~ tyaq ~ tA lE kE lW lE ~ — ~ bI qA bA lu tE ~ ya yu ta lE ~ ."),
    "Introductions": P("twwqoch"),
    "Introductions stay in-app for now. Phone numbers, Telegram handles, and links can't be shared here.":
        P("twwqoch ~ lA aA hU nE ~ bA mA tA gE bE rI ya wE ~ wst ~ yE qO ya lu ~ .",
          "~ sE lE kE ~ qU TE rO kE nE ~ , ~ yA Telegram ~ mA lA ya wO kE nE na ~ mA gA na nya wO kE nE ~ aE zI hE ~ ma ga ra tE ~ aA yE CHa lE mE ~ ."),
    "I’m interested": P("fE la gO tE ~ aA lA nyE"),
    "Keep getting to know each other": P("aE rE sE ~ bA aE rE sE ~ mA tA wa wA qE ~ yE qA TE lu"),
    "Keep on shortlist": P("bA zE rE zE ru ~ yE qO yE"),
    "Kidan is temporarily unavailable": P("Kidan ~ lA gI ze wO ~ aA yE gA nyE mE"),
    "Kidan will check in with you once more around {date}.":
        P("Kidan ~ bA {date} ~ aA ka ba bI ~ endgna ~ yE TA yE qE wO ta lE ~ ."),
    "Kidan will check in with you once more in a few days.":
        P("Kidan ~ bA Tqyt ~ qA na tE ~ endgna ~ yE TA yE qE wO ta lE ~ ."),
    "Kidan will never place a name, phone number, or profile detail in a bot notification.":
        P("Kidan ~ sE mE ~ , ~ sE lE kE ~ qU TE rE ~ waym ~ yA megelecha ~ zE rE zE rE nE ~ bA bO tE ~ ma sa wA qI ya ~ wst",
          "~ bA fE TSu mE ~ aA yE sE gA ba mE ~ ."),
    "Kidan will quietly step back. May your path be blessed.":
        P("Kidan ~ bA zE mE ta ~ yE lA qa lE ~ . ~ mA nE gA dE wO ~ yA tA ba rA kA ~ yE hU nE ~ ."),
    "Know exactly what others can see.":
        P("lE lO kE ~ mE nE ~ ma ya tE ~ aE nE dA mi CHE lu ~ bA tE kE kE lE ~ yE wA qu ~ ."),
    "Marriage goal": P("yA ga bE CHa ~ a2a la ma"),
    "Master’s degree": P("yA hU lA tA nya ~ dI gE rI"),
    "Message": P("mA lE aE kE tE"),
    "Message type": P("yA mA lE aE kE tE ~ aA yE nA tE"),
    "Mutual growth": P("yA ga ra ~ aE dE gA tE"),
    "Mutual interest": P("yA ga ra ~ fE la gO tE"),
    "Name and contact remain hidden.":
        P("sE mE na ~ yA mA gA na nya ~ mA rA ja ~ tA dA bE qA wE ~ yE qO ya lu ~ ."),
    "Names and contact details were revealed together. Open to view — deliberately, when you choose.":
        P("sE mA wO kE na ~ yA mA gA na nya ~ mA rA ja wO kE ~ aA bE rE wE ~ tA gE lA TSu ~ .",
          "~ lA ma ya tE ~ yE kE fA TU ~ — ~ bA aA la ma ~ , ~ bA mA rA TU tE ~ gI ze ~ ."),
    "Never shown in discovery": P("bA fleka ~ bA fE TSu mE ~ aA yE ta yE mE"),
    "Next step": P("qA Ta yu ~ dA rA ja"),
    "No ads or sale.": P("mE nE mE ~ ma sE ta wa qI ya ~ waym ~ shE ya chE ~ yA lA mE ~ ."),
    "No ads, no social links, no profile selling, and no AI training on your personal information.":
        P("mE nE mE ~ ma sE ta wa qI ya ~ , ~ ma hE bA ra wI ~ mA gA na nya wO kE ~ , ~ yA megelecha ~ shE ya chE",
          "~ waym ~ bA yA gl ~ mA rA ja wO ~ lay ~ yA AI ~ sE lE TA na ~ yA lA mE ~ ."),
})

# ============================================================ batch 3d: negatives/pending/private/profile
AM.update({
    "No children": P("lE jO kE ~ yA lu mE"),
    "No contact before every approval.": P("hU lu mE ~ fkd ~ aE sE kI yE TA na qA qE ~ mE nE mE ~ gnyt ~ yA lA mE ~ ."),
    "No identity or contact information has been shared.":
        P("mE nE mE ~ ma nE nA tE ~ waym ~ yA mA gA na nya ~ mA rA ja ~ aA lE tA ga ra mE ~ ."),
    "No information was uploaded or saved. This prototype used in-memory draft data only.":
        P("mE nE mE ~ mA rA ja ~ aA lE tA cha nA mE ~ waym ~ aA lE tA qA mA TA mE ~ .",
          "~ yE hE ~ na mu na ~ bA ma hE dA rE - tE wE sE ta ~ wst ~ ya lA ~ rqiq ~ mA rA ja ~ bcha ~ tA TA qE mW lE ~ ."),
    "No introductions yet": P("aE sE ka hU nE ~ twwqoch ~ yA lu mE"),
    "No messages yet. Send a brief, values-centered greeting to begin.":
        P("aE sE ka hU nE ~ mA lE aE kE tE wO kE ~ yA lu mE ~ . ~ lA mA jA mA rE ~ aA chE rE ~ , ~ bealma ~ lay ~ ya tA kO rA ~ sA la mE ta ~ yE la ku ~ ."),
    "No names, phone numbers, Telegram accounts, or photos appear in discovery.":
        P("sE mA wO kE ~ , ~ sE lE kE ~ qU TE rO kE ~ , ~ yA Telegram ~ mA lA ya wO kE ~ waym ~ fO tO wO kE ~ bA fleka ~ aA yE ta yu mE ~ ."),
    "No pending requests. When someone sends you an introduction, their values-only summary appears here — never their name, photo, or contact details.":
        P("bA mA TA ba bA qE ~ lay ~ ya lu ~ tyaqoch ~ yA lu mE ~ . ~ aA nE dE ~ sA wE ~ twwq ~ sI lE kE lE wO ~ , ~ bealma ~ yA tA zA ga jA ~ ma TA qa la ya CHe wE ~ aE zI hE ~ yE ta ya lE",
          "~ — ~ sE ma CHA wE ~ , ~ fO tO aA CHA wE ~ waym ~ yA mA gA na nya ~ mA rA ja CHA wE ~ gE nE ~ bA fE TSu mE ~ aA yE ta yE mE ~ ."),
    "Not available": P("aA yE gA nyE mE"),
    "Not completed": P("aA lE tA TA na qA qA mE"),
    "Not just yet — the bot will ask again soon.":
        P("aA hU nE ~ aA yE dA lA mE ~ — ~ bO tu ~ bA qE rE bu ~ endgna ~ yE TA yE qa lE ~ ."),
    "Not shared": P("aA lE tA ga ra mE"),
    "Not working": P("aA yE sA ra mE"),
    "Not yet": P("gA na"),
    "Not yet is a good answer": P("gA na ~ mA lE ka mE ~ mE lE sE ~ nA wE"),
    "Not yet — keep chatting": P("gA na ~ — ~ CHa tE nE ~ yE qA TE lu"),
    "Occupation": P("SAE ra"),
    "One final simultaneous step and the reveal begins.":
        P("aA nE dE ~ yA mA ch rA sha ~ yA ga ra ~ dA rA ja ~ bcha ~ qA rE bE tW lE ~ — ~ kA zI ya ~ megelecha wE ~ yE jA mA ra lE ~ ."),
    "One introduction is with the admin": P("aA nE dE ~ twwq ~ bA astedari ~ aE jE ~ lay ~ nA wE"),
    "One last step": P("aA nE dE ~ yA mA ch rA sha ~ dA rA ja"),
    "One last step from them": P("kA aE sa CHA wE ~ aA nE dE ~ yA mA ch rA sha ~ dA rA ja"),
    "One last step from you": P("kA aE rE sE wO ~ aA nE dE ~ yA mA ch rA sha ~ dA rA ja"),
    "One-sided interest is never disclosed.":
        P("yA aA nE dE ~ wA gA nE ~ fE la gO tE ~ bA fE TSu mE ~ aA yE gE lA TSE mE ~ ."),
    "Only accepted introductions reach here. One-sided decisions are never shown, and no identity is shared until everyone confirms and an administrator approves.":
        P("yA tA qA bA lu tE ~ twwqoch ~ bcha ~ aE zI hE ~ yE dA rE sa lu ~ . ~ yA aA nE dE ~ wA gA nE ~ wE sa ne ao kE ~ bA fE TSu mE ~ aA yE ta yu mE ~ .",
          "~ hU lu mE ~ aE sE kI ya rA ga gE TU na ~ astedari ~ aE sE kI TS dE qE ~ dE rA sE mE ~ mE nE mE ~ ma nE nA tE ~ aA yE ga ra mE ~ ."),
    "Open communication": P("kE fE tE ~ gnyt"),
    "Open to a partner with children": P("lE jO kE ~ lA aA lu tE ~ aA ga rE ~ kE fE tE"),
    "Open to discussion": P("lA wE yE yE tE ~ kE fE tE"),
    "Open to someone living abroad": P("bA wE chE ~ lA mi nO rE ~ sA wE ~ kE fE tE"),
    "Optional. Do not add phone numbers, usernames, links, or identifying details.":
        P("aA ma ra chE ~ nA wE ~ . ~ sE lE kE ~ qU TE rO kE nE ~ , ~ yA tA TA qa mI ~ sE mA wO kE nE ~ , ~ mA gA na nya wO kE nE ~ waym ~ ma nE nA tE ~ yA mi gE lA TSu ~ zE rE zE rO kE nE ~ aA yE ch mE ru ~ ."),
    "Other": P("lE la"),
    "PASS": P("tA mA lA sA"),
    "Pass privately": P("bA sE wE rE ~ ya lE fu"),
    "Patience": P("tE aE gE sE tE"),
    "Pending administrator verification": P("yA astedari ~ mrgcha ~ bA mA TA ba bA qE ~ lay"),
    "Pending review": P("gE mE gA ma ~ bA mA TA ba bA qE ~ lay"),
    "Permanently erase your account and all personal data.":
        P("mA lA ya wO nE na ~ hU lu nE mE ~ yA gl ~ mA rA ja ~ bA kWa mI nA tE ~ ya TE fu ~ ."),
    "Please write a short message.": P("ebakwo ~ aA chE rE ~ mA lE aE kE tE ~ yE TSa fu ~ ."),
    "Preferences": P("mE rE cha wO kE"),
    "Preferences are matching-only": P("mE rE cha wO kE ~ lA ma Ta mA rE ~ bcha ~ nA wE"),
    "Preparing…": P("bA mA zA ga ja tE ~ lay ~ …"),
    "Privacy & your data": P("gE la wI nA tE na ~ mA rA ja wO"),
    "Private admin review": P("yA astedari ~ yA gl ~ gE mE gA ma"),
    "Private by default": P("bA nA ba rI ~ gE la wI"),
    "Private by default.": P("bA nA ba rI ~ gE la wI ~ ."),
    "Private by design": P("bA nE dE fE ~ gE la wI"),
    "Private identity": P("yA gl ~ ma nE nA tE"),
    "Private identity processing": P("yA gl ~ ma nE nA tE ~ mA rA ja ~ aA ya ya zE"),
    "Private note": P("yA gl ~ ma sE ta wa sha"),
    "Private review": P("yA gl ~ gE mE gA ma"),
    "Profile decisions": P("yA megelecha ~ wE sa ne ao kE"),
    "Profile discovery": P("yA megelecha ~ fleka"),
    "Profile review": P("yA megelecha ~ gE mE gA ma"),
    "Profile settings": P("yA megelecha ~ qE nE bE rO kE"),
    "Prototype complete": P("na mu na ~ tetnqwal"),
    "Prototype mode: submitting will not upload, persist, or transmit any information.":
        P("yA na mu na ~ hU nA ta ~ ፦ ~ ma sE gA ba tE ~ mE nE mE ~ mA rA ja ~ aA yE ch nE mE ~ , ~ aA ya sE qA mA TE mE ~ waym ~ aA yE lE kE mE ~ ."),
    "Public profile": P("yA HE zE bE ~ megelecha"),
})

# ============================================================ batch 3e: readiness/submit/session/feedback
AM.update({
    "Reach out when you're both ready. Kindly, and at your own pace.":
        P("hU lA ta kE hU mE ~ zE gE ju ~ sI hO nu ~ bA aE kE bE rO tE na ~ bA rA aE sE wO ~ fE TE nA tE ~ yE gA na nyu ~ ."),
    "Readiness": P("zE gE ju ~ mA hO nE"),
    "Ready means you're open to meeting this person. Not yet keeps things exactly as they are.":
        P("zE gE ju ~ ma lA tE ~ yE hE nE ~ sA wE ~ lA mA gA na nya TE ~ kE fE tE ~ mA hO nE ~ nA wE ~ .",
          "~ gA na ~ ma lA tE ~ gE nE ~ nA gA rO kE ~ aE nE dA lu bA tE ~ aE nE dI qO yu ~ ya dA rE ga lE ~ ."),
    "Ready to meet": P("lA mA gA na nya TE ~ zE gE ju"),
    "Ready, not yet, or a respectful close are all honest answers.":
        P("zE gE ju ~ , ~ gA na ~ aA lA mA hO nE ~ waym ~ bA aE kE bE rO tE ~ mA zE ga tE ~ hU lu mE ~ qE nE ~ mA lE sO kE ~ na CHe wE ~ ."),
    "Reload latest": P("yA qE rE bu nE ~ yE cha nu"),
    "Reopen profile": P("megelecha wO nE ~ endgna ~ yE kE fA TU"),
    "Reopen your profile below, make the change, and submit again.":
        P("bA ta CHE ~ megelecha wO nE ~ endgna ~ yE kE fA TU ~ , ~ lA wE TE wO nE ~ ya dE rE gu na ~ endgna ~ yasgabu ~ ."),
    "Request accepted": P("tyaq ~ tA qA bE lA wa lE"),
    "Request declined quietly.": P("tyaq ~ bA zE mE ta ~ tA mA lE lW lE ~ ."),
    "Request sent": P("tyaq ~ tA lE kE lW lE"),
    "Restoring your saved progress.": P("yA tA qA mA TA wO nE ~ hI dA tE wO nE ~ bA mA mA lA sE ~ lay ~ ."),
    "Restricted introduction": P("yA tA gA dA bA ~ twwq"),
    "Restricted introductions.": P("yA tA gA dA bu ~ twwqoch ~ ."),
    "Retrying…": P("endgna ~ bA mA mO kA rA ~ lay ~ …"),
    "Review": P("gE mE gA ma"),
    "Review incoming requests & your shortlist":
        P("gA bI ~ TE ya qe wO kE nE na ~ yA gl ~ mE rE cha ~ zE rE zE rE wO nE ~ yE mA lE kA tu"),
    "Review result": P("yA gE mE gA ma ~ wE TE ne"),
    "Review the age range and select at least one status, value, and marriage intention.":
        P("yA a2E dE mE ~ kE lE lu nE ~ yE mA lE kA tu na ~ bI ya nE sE ~ aA nE dE ~ huneta ~ , ~ aE se tE na ~ yA ga bE CHa ~ a2a la ma ~ yE mE rA TU ~ ."),
    "Review the private note below, reopen your profile, make the change, and submit again.":
        P("bA ta CHE ~ ya lA wO nE ~ yA gl ~ ma sE ta wa sha ~ yE mA lE kA tu ~ , ~ megelecha wO nE ~ endgna ~ yE kE fA TU ~ ,",
          "~ lA wE TE wO nE ~ ya dE rE gu na ~ endgna ~ yasgabu ~ ."),
    "Review your draft": P("rqiq wO nE ~ yE mA lE kA tu"),
    "Saving…": P("bA mA sE qA mA TE ~ lay ~ …"),
    "Secondary school": P("hU lA tA nya ~ dA rA ja ~ tE mE hE rE tE"),
    "Secure photo upload is being prepared":
        P("yA tA TA bA qA ~ yA fO tO ~ chE nA tE ~ bA mA zA ga ja tE ~ lay"),
    "See your next step": P("qA Ta yu nE ~ dA rA ja wO ~ yE mA lE kA tu"),
    "Seeking work": P("SAE ra ~ bA mA fA lA gE ~ lay"),
    "Self-employed": P("yA rA aE sE ~ SAE ra"),
    "Send a formal introduction?": P("yA twwq ~ tyaq ~ yE la ku ~ ?"),
    "Send an introduction request": P("yA twwq ~ tyaq ~ yE la ku"),
    "Send to operator": P("lA astedari ~ yE la ku"),
    "Send up to 5 deliberate requests a day. Declines are silent and requests expire after 72 hours.":
        P("bA qA nE ~ aE sE kA ~ 5 ~ yA tA qa du ~ TE ya qe wO kE ~ yE la ku ~ . ~ mA mA lA sE ~ zE mE ta ~ nA wE ~ ,",
          "~ TE ya qe wO kE mE ~ kA 72 ~ sA aA tE ~ bA HWa la ~ ya bA qa lu ~ ."),
    "Sending…": P("bA mA la kE ~ lay ~ …"),
    "Service": P("aA gA lE gE lO tE"),
    "Service temporarily unavailable": P("aA gA lE gE lO tu ~ lA gI ze wO ~ aA yE gA nyE mE"),
    "Session expired": P("kE fE lA - gI ze wO ~ aA lE kWa lE"),
    "Share context, not your identity.": P("aA wE dE ~ ya ga ru ~ , ~ ma nE nA tE wO nE ~ aA yE dA lA mE ~ ."),
    "Share your character, family intentions, and what a faithful partnership means to you.":
        P("ba hE rI wO nE ~ , ~ yA btsb ~ a2a la ma wO kE wO nE na ~ ta ma nyE ~ yA hE bE rA tE ~ tE rE gu mE",
          "~ lA aE rE sE wO ~ mE nE ~ aE nE dA hO nA ~ ya ga ru ~ ."),
    "Sign out": P("ywTu"),
    "Signed in": P("gA bE tA wA lE"),
    "Signed out": P("wA TE tA wA lE"),
    "Signing out…": P("bA mA wE TA tE ~ lay ~ …"),
    "Something didn't complete. Nothing is lost — please try again.":
        P("aA nE dE ~ nA gA rE ~ aA lE tA TA na qA qA mE ~ . ~ mE nE mE ~ aA lE TA fa mE ~ — ~ ebakwo ~ endgna ~ ymkru ~ ."),
    "Something went wrong. Please try again.": P("CHE gE rE ~ tA fA TE rW lE ~ . ~ ebakwo ~ endgna ~ ymkru ~ ."),
    "Start your profile": P("megelecha wO nE ~ yE jA mE ru"),
    "Student": P("tA mA rI"),
    "Submission not enabled in this preview": P("bA zI hE ~ qdm_eyta ~ ma sE gA ba tE ~ aA lE nA qa mE"),
    "Submitted": P("gA bE tW lE"),
    "Submitting sends your public profile and consent for private administrator review. Your name, phone, photo, and contact details stay hidden and are never shown in discovery.":
        P("ma sE gA ba tE ~ yA HE zE bE ~ megelecha wO nE na ~ lA astedari ~ yA gl ~ gE mE gA ma ~ yA mi hO nE ~ fA qa dE wO nE ~ yE lE ka lE ~ .",
          "~ sE mE wO ~ , ~ sE lE kE wO ~ , ~ fO tO wO na ~ yA mA gA na nya ~ mA rA ja wO ~ gE nE ~ tA dA bE qA wE ~ yE qO ya lu ~ ,",
          "~ bA fleka mA ~ bA fE TSu mE ~ aA yE ta yu mE ~ ."),
    "Swipe or choose": P("ya nE sh ra TU ~ waym ~ yE mE rA TU"),
    "Take the time you need. We'll keep checking in gently.":
        P("yA mi ya sE fA lE gE wO tE nE ~ gI ze ~ yE wE sA du ~ . ~ bA aE kE bE rO tE ~ aE yA TA ya qE nE ~ aE nE qA TE la lA nE ~ ."),
    "Telegram launch data is sent securely to Kidan to authenticate your session. The current API retains the validated Telegram ID and authentication date for account and session security. Telegram names and usernames are not added to your public draft or shown in discovery. This preview does not collect Kidan private identity, verification-photo, or submission-consent details.":
        P("yA Telegram ~ mA nA sha ~ mA rA ja ~ kE fE lA - gI ze wO nE ~ lA ma rA ga gA TE ~ wd ~ Kidan ~ bA dA hE nE nA tE ~ yE la ka lE ~ .",
          "~ yA aA hU nu ~ API ~ lA mA lA ya na ~ lA kE fE lA - gI ze ~ dA hE nE nA tE ~ sI ba lE ~ yA tA rA ga gA TA wO nE ~ yA Telegram ~ mA ta wA qI ya na ~ yA mrgcha ~ qA nE ~ yE zO ~ yE qO ya lE ~ .",
          "~ yA Telegram ~ sE mA wO kE na ~ yA tA TA qa mI ~ sE mA wO ~ wd ~ yA HE zE bE ~ rqiq wO ~ aA yE ch mA ru mE ~ , ~ bA fE lA ga mA ~ aA yE ta yu mE ~ .",
          "~ yE hE ~ qdm_eyta ~ yA Kidan ~ yA gl ~ ma nE nA tE ~ , ~ yA mrgcha ~ fO tO ~ waym ~ yA ma sE gA ba tE ~ fA qa dE ~ mA rA ja wO kE nE ~ aA yE sA bA sE bE mE ~ ."),
    "Tell us what\\u2019s on your mind. This goes privately to the operator.":
        P("bA aA aA mE rO wO ~ wst ~ ya lA wO nE ~ yE nE gA ru nE ~ . ~ yE hE ~ bA sE wE rE ~ lA aA gA lE gE lO tE ~ sA chi wE ~ yE dA rE sa lE ~ ."),
    "Thank you for trying with sincerity.": P("bA qE nE nA tE ~ sE lA mO kA ru ~ aA mA sA gE na lA hu ~ ."),
    "Thanks — got it": P("aA mA sA gE na lA hu ~ — ~ gE lE sE ~ nA wE"),
    "That request is no longer available.": P("ya ~ tyaq ~ kA aA hU nE ~ bA HWa la ~ aA yE gA nyE mE ~ ."),
    "The information is accurate": P("mA rA ja wO ~ tE kE kE lE ~ nA wE"),
    "The moment they do, the reveal happens for you both at once. Nothing is shared until then.":
        P("wA dI ya wE nu ~ megelecha wE ~ lA hU lA ta kE hU mE ~ bA aA nE dE ~ gI ze ~ yE ka hE da lE ~ .",
          "~ aE sE kA zI ya wO ~ dE rA sE ~ mE nE mE ~ aA yE ga ra mE ~ ."),
    "The next step unlocks after {parts} — keep chatting.":
        P("qA Ta yu ~ dA rA ja ~ kA {parts} ~ bA HWa la ~ yE kA fA ta lE ~ — ~ CHa tE nE ~ yE qA TE lu ~ ."),
})

# ============================================================ batch 3f: pairing/reveal/waiting/consent
AM.update({
    "The next step unlocks after {parts} — the bot will ask you both when it's time.":
        P("qA Ta yu ~ dA rA ja ~ kA {parts} ~ bA HWa la ~ yE kA fA ta lE ~ — ~ gI ze wO ~ sI dA rA sE ~ bO tu ~ hU lA ta kE hU mE ~ yE TA yE qa lE ~ ."),
    "The pilot is open to candidates aged 21–45. Enter a valid date of birth.":
        P("pa yE la tu ~ lA 21 - 45 ~ a2E dA me ~ ya la CHA wE ~ aE CHu wO kE ~ kE fE tE ~ nA wE ~ . ~ tE kE kE lA nya ~ yA lE dA tE ~ qA nE ~ yasgabu ~ ."),
    "The private verification photo cannot later become a discovery photo without a separate upload and a new consent.":
        P("yA gE lu ~ yA mrgcha ~ fO tO ~ ya lA ~ tA cha ma rI ~ CHa nA tE na ~ aA dI sE ~ fkd ~ bA fE sE TSu mE ~ yA fleka ~ fO tO ~ aA yE hO nE mE ~ ."),
    "The readiness loop and reveal happen here — gentle, and always at both your paces.":
        P("yA zE gE ju nA tE ~ a2u dA tE na ~ megelecha wE ~ aE zI hE ~ yE kA na wA na lu ~ — ~ bA lA sE la sa na ~ hU lE gI ze ~ bA hU lA ta kE hU mE ~ fE TE nA tE ~ ."),
    "The reveal": P("megelecha wE"),
    "Their name and contact details are shown only when you choose to see them.":
        P("sE ma CHA wE na ~ yA mA gA na nya ~ mA rA ja CHA wE ~ yA mi ta yu tE ~ lA ma ya tE ~ sI mA rA TU ~ bcha ~ nA wE ~ ."),
    "They accepted your introduction. Both of you confirm before an administrator reviews.":
        P("twwq wO nE ~ tA qA bE lA wa lE ~ . ~ astedari ~ gE mE gA ma ~ kA ma dA rA gu ~ bA fI tE ~ hU lA ta kE hU mE ~ ya rA ga gE TU ~ ."),
    "They accepted. Both of you confirm next, then an administrator approves.":
        P("tA qA bE lA wa lE ~ . ~ qA TE lO ~ hU lA ta kE hU mE ~ ya rA ga gE TU ~ , ~ kA zI ya ~ astedari ~ yE TS dE qa lE ~ ."),
    "They can review your values-only summary. You’ll see it here if they accept — otherwise it quietly expires.":
        P("bealma ~ yA tA zA ga jA wO nE ~ ma TA qa la ya wO nE ~ ma ya tE ~ yE CHE la lu ~ . ~ bI qA bA lu tE ~ aE zI hE ~ ya yu ta lE ~ — ~ kA lE hO nA ~ gE nE ~ bA zE mE ta ~ ya bA qa lE ~ ."),
    "They're ready for the next step. Answer honestly — not yet is a good answer.":
        P("aE sa CHA wE ~ lA qA Ta yu ~ dA rA ja ~ zE gE ju ~ na CHe wE ~ . ~ bA qE nE nA tE ~ yE mA lE su ~ — ~ gA na ~ mA lE ka mE ~ mE lE sE ~ nA wE ~ ."),
    "They've said ready for the next step. There's no pressure — answer honestly.":
        P("aE sa CHA wE ~ lA qA Ta yu ~ dA rA ja ~ zE gE ju ~ mA hO na CHA wO nE ~ gA lE TS wA lE ~ . ~ mE nE mE ~ cha na ~ yA lA mE ~ — ~ bA qE nE nA tE ~ yE mA lE su ~ ."),
    "This conversation stays inside Kidan. Names, phone numbers, Telegram handles, and links are not shared — get to know each other through values first.":
        P("yE hE ~ wE yE yE tE ~ bA Kidan ~ wst ~ yE qO ya lE ~ . ~ sE mA wO kE ~ , ~ sE lE kE ~ qU TE rO kE ~ , ~ yA Telegram ~ mA lA ya wO kE na ~ mA gA na nya wO kE ~ aA yE ga ru mE",
          "~ — ~ bA mA jA mA rI ya ~ bealma wO kE ~ bA ku lE ~ aE rE sE ~ bA aE rE sE ~ yE tA wa wA qu ~ ."),
    "This introduction was declined. No further steps are needed.":
        P("yE hE ~ twwq ~ tA mA lE lW lE ~ . ~ tA cha ma rI ~ dA rA ja wO kE ~ aA ya sE fA lE gu mE ~ ."),
    "This is a local prototype. Use the synthetic sample—not real personal information.":
        P("yE hE ~ bA aA ka ba bI ~ yA tA SA rA ~ na mu na ~ nA wE ~ . ~ sA wE ~ sA ra shE ~ na mu na wO nE ~ yE TA qA mu ~ — ~ aE wE nA tA nya ~ yA gl ~ mA rA ja nE ~ aA yE dA lA mE ~ ."),
    "This message was removed by a moderator.": P("yE hE ~ mA lE aE kE tE ~ bA tA qO Ta Ta rI ~ tA wA gE gW lE ~ ."),
    "This pairing has already been closed.": P("yE hE ~ ma Ta mA rE ~ qA dE mO ~ tA zA gE tW lE ~ ."),
    "This pairing has been respectfully closed.": P("yE hE ~ ma Ta mA rE ~ bA aE kE bE rO tE ~ tA zA gE tW lE ~ ."),
    "This pairing has moved forward.": P("yE hE ~ ma Ta mA rE ~ wA dA fI tE ~ aA mE rE tW lE ~ ."),
    "This pairing is not visible here. It may have been closed by an administrator.":
        P("yE hE ~ ma Ta mA rE ~ aE zI hE ~ aA yE Ta yE mE ~ . ~ bA astedari ~ tA zA gE tO ~ lI hO nE ~ yE CHa la lE ~ ."),
    "This path has been quiet — a decision moves things forward either way.":
        P("yE hE ~ mA nE gA dE ~ TS TE ~ bE lW lE ~ — ~ wE sa ne ~ gE nE ~ nA gA rO kE nE ~ bA ma nE nya wE mA ~ aA qE Ta cha ~ ya nE qA sa qE sa lE ~ ."),
    "This preview saves only your public profile sections. Identity, verification, and review are disabled.":
        P("yE hE ~ qdm_eyta ~ yA HE zE bE ~ megelecha ~ kE fE lO kE wO nE ~ bcha ~ ya sE qA mA ta lE ~ . ~ ma nE nA tE ~ , ~ ma rA ga gA TE na ~ gE mE gA ma ~ tA sA na kA lA wA lE ~ ."),
    "Tradition": P("wA gE"),
    "Update requested": P("ma sE tA ka kA ya ~ tA TA yE kWa lE"),
    "Upload verification photo": P("yA mrgcha ~ fO tO ~ yE cha nu"),
    "Upload your private verification photo": P("yA gE lE wO nE ~ yA mrgcha ~ fO tO ~ yE cha nu"),
    "Upload your private verification photo to continue.":
        P("lA mA qA TE lE ~ yA gE lE wO nE ~ yA mrgcha ~ fO tO ~ yE cha nu ~ ."),
    "Use synthetic sample data for this prototype": P("lA zI hE ~ sA wE ~ sA ra shE ~ na mu na ~ mA rA ja ~ yE TA qA mu"),
    "Used only to verify identity. It is never shown in discovery and is deleted 30 days after approval.":
        P("ma nE nA tE nE ~ lA ma rA ga gA TE ~ bcha ~ yE TA qA mA lE ~ . ~ bA fleka ~ bA fE TSu mE ~ aA yE ta yE mE ~ , ~ kA TS dA qA ~ 30 ~ qA nE ~ bA HWa la ~ yE wA gA da lE ~ ."),
    "Values that matter": P("tE rE gu mE ~ ya la CHA wE ~ aE se tO kE"),
    "Values-only introduction": P("bealma ~ twwq"),
    "Verification photo.": P("yA mrgcha ~ fO tO ~ ."),
    "Verification-photo processing": P("yA mrgcha ~ fO tO ~ aA ya ya zE"),
    "Verified": P("yA tA rA ga gA TA"),
    "Verify the person, protect the identity.": P("sA wE nE ~ ya rA ga gE TU ~ , ~ ma nE nA tu nE ~ yE TA bE qu ~ ."),
    "Visible in the full discovery profile": P("bA mu lu wO ~ yA fleka ~ megelecha ~ wst ~ yE ta ya lE"),
    "Waiting": P("bA mA TA ba bA qE ~ lay"),
    "Waiting for their confirmation": P("yA aE sa CHA wE ~ mrgcha ~ bA mA TA ba bA qE ~ lay"),
    "Waiting for them to confirm.": P("aE sa CHA wE ~ aE nE dI ya rA ga gE TU ~ bA mA TA ba bA qE ~ lay ~ ."),
    "Waiting on their answer": P("mE lE sa CHA wO nE ~ bA mA TA ba bA qE ~ lay"),
    "Waiting on their heart": P("lE bE CHA wO nE ~ bA mA TA ba bA qE ~ lay"),
    "We couldn't load your journey right now. Please try again.":
        P("aA hU nE ~ gu zO wO nE ~ mA CHa nE ~ alchlnm ~ . ~ ebakwo ~ endgna ~ ymkru ~ ."),
    "We couldn’t save your progress. Please retry.":
        P("hI dA tE wO nE ~ mA sE qA mA TE ~ alchlnm ~ . ~ ebakwo ~ endgna ~ ymkru ~ ."),
    "We do not sell personal data, show ads, or use your information for AI training.":
        P("yA gl ~ mA rA ja nE ~ aA nE sh TE mE ~ , ~ ma sE ta wa qI ya ~ aA na sa yE mE ~ , ~ mA rA ja wO nE mA ~ lA AI ~ sE lE TA na ~ aA nE TA qA mA mE bA tE mE ~ ."),
    "We're together": P("aA bE rA nE ~ nA nE"),
    "What\\u2019s this about?": P("yE hE ~ sE lA ~ mE nE dE nE ~ nA wE ~ ?"),
    "When two people independently choose each other and an administrator approves, the introduction appears here. Names and contact details remain private throughout.":
        P("hU lA tE ~ sA wO kE ~ bA nA TSa ~ hU nA tA ~ aE rE sE ~ bA aE rE sE ~ sI mA rA TU na ~ astedari ~ sI TS dE qE ~ twwq wE ~ aE zI hE ~ yE ta ya lE ~ .",
          "~ sE mA wO kE na ~ yA mA gA na nya ~ mA rA ja wO kE ~ mu lu ~ gI ze wO nE mA ~ gE la wI ~ hO nA wE ~ yE qO ya lu ~ ."),
    "When you each confirm, Kidan reveals your names and contact details to one another — at the same time, so no one is left waiting after revealing theirs.":
        P("hU lA ta kE hU mE ~ sI ya rA ga gE TU ~ , ~ Kidan ~ sE mA wO kE nE na ~ yA mA gA na nya ~ mA rA ja wO kE nE ~ lA hU lA ta kE hU mE ~ yE gA lA TSa lE ~ — ~ bA aA nE dE ~ gI ze ~ ,",
          "~ sE lA zI hE ~ yA rA su nE ~ kA gA lA TSa ~ bA HWa la ~ mA nE mA ~ TA ba qI ~ hO nO ~ aA yE qA rE mE ~ ."),
    "Where do you two stand?": P("hU lA ta kE hU ~ bA yA tA nya wE ~ dA rA ja ~ lay ~ na CHA hU ~ ?"),
    "With the administrator": P("bA astedari ~ aE jE"),
    "Work": P("SAE ra"),
    "Would like children": P("lE jO kE ~ yE fA lE ga lu"),
    "Write a short greeting (no contact details)…":
        P("aA chE rE ~ sA la mE ta ~ yE TSa fu ~ ( ~ ya lA ~ mA gA na nya ~ mA rA ja ~ ) ~ …"),
    "Yes, I'm ready": P("aA wO ~ , ~ zE gE ju ~ nA nyE"),
    "You both confirmed. An administrator will review before the introduction opens.":
        P("hU lA ta kE hU mE ~ aA rA ga gE TA wA lE ~ . ~ twwq wE ~ kA mA kA fA tu ~ bA fI tE ~ astedari ~ yE gA mA gE ma lE ~ ."),
    "You can download everything we hold about you, or permanently delete your account and all of your data, at any time below.":
        P("sE lA ~ aE rE sE wO ~ ya lA nE ~ nA gA rE ~ hU lu ~ ma wE rA dE ~ waym ~ mA lA ya wO nE na ~ mA rA ja wO nE ~ hU lu ~ bA kWa mI nA tE ~ ma TE fa tE",
          "~ bA ma nE nya wE mA ~ gI ze ~ bA ta CHE ~ yE CHE la lu ~ ."),
    "You can send {n} more today. Requests expire after 72 hours.":
        P("zare ~ tA cha ma rI ~ {n} ~ mA la kE ~ yE CHE la lu ~ . ~ TE ya qe wO kE ~ kA 72 ~ sA aA tE ~ bA HWa la ~ ya bA qa lu ~ ."),
})

# ============================================================ batch 3g: final — your-profile/readiness/counters
AM.update({
    "You haven’t sent any introduction requests yet. Right-swipe someone on Discover to add them to your private shortlist, then send a request from there.":
        P("aE sE ka hU nE ~ mE nE mE ~ yA twwq ~ tyaq ~ aA lE la ku mE ~ . ~ bA fleka ~ lay ~ aA nE dE ~ sA wE nE ~ wA dA ~ qA nyE ~ ya nE sh ra TU ~ ,",
          "~ wA dA ~ yA gl ~ mE rE cha ~ zE rE zE rE wO ~ lA mA ch mA rE ~ , ~ kA zI ya mA ~ tyaq ~ yE la ku ~ ."),
    "You're both ready": P("hU lA ta kE hU mE ~ zE gE ju ~ na CHA hU"),
    "You're both ready — confirm to reveal your names to each other at the same time.":
        P("hU lA ta kE hU mE ~ zE gE ju ~ na CHA hU ~ — ~ sE mO CHa CHA hU nE ~ lA aA nE dA nE dA CHA hU ~ bA aA nE dE ~ gI ze ~ lA mA gE lA TSE ~ ya rA ga gE TU ~ ."),
    "You're both ready.": P("hU lA ta kE hU mE ~ zE gE ju ~ na CHA hU ~ ."),
    "You're walking forward together.": P("aA bE ra CHA hU ~ wA dA fI tE ~ aE yA he da CHA hU ~ nA wE ~ ."),
    "You've said ready. They'll answer the same question in their own time.":
        P("zE gE ju ~ mA hO nE wO nE ~ gA lE TS wA lE ~ . ~ aE sa CHA wE ~ tA mA sa sa yE ~ tyaq nE ~ bA rA sa CHA wE ~ gI ze ~ yE mA lE sa lu ~ ."),
    "You've said ready. We'll let you know the moment they answer too.":
        P("zE gE ju ~ mA hO nE wO nE ~ gA lE TS wA lE ~ . ~ aE sa CHA wE mE ~ sI mA lE su ~ wA dI ya wE nu ~ aE nE na sa wE qE wO ta lE ~ ."),
    "Your account and data have been deleted. You can close Kidan.":
        P("mA lA ya wO na ~ mA rA ja wO ~ tA wA gE dA wA lE ~ . ~ Kidan nE ~ mA zE ga tE ~ yE CHE la lu ~ ."),
    "Your city": P("kA tA ma wO"),
    "Your connections": P("gE nE nyU nA tO kE wO"),
    "Your data bundle has been downloaded.": P("yA mA rA ja ~ TE qE lE wO ~ wA rE rW lE ~ ."),
    "Your data promise": P("yA mA rA ja ~ qa lE ~ kI da nE"),
    "Your details remain hidden and are not published. You can review any private note below, or delete your account and all data from Privacy & consent.":
        P("mA rA ja wO ~ tA dA bE qO ~ yE qO ya lE ~ , ~ lA HE zE bE mA ~ aA yE qA rE bE mE ~ .",
          "~ bA ta CHE ~ ya lA wO nE ~ yA gl ~ ma sE ta wa sha ~ ma ya tE ~ waym ~ kA gE la wI nA tE na ~ fA qa dE ~ kE fE lE ~ mA lA ya wO nE na ~ mA rA ja wO nE ~ hU lu ~ ma TE fa tE ~ yE CHE la lu ~ ."),
    "Your information, your choices.": P("mA rA ja wO ~ , ~ mE rE cha wO kE wO ~ ."),
    "Your introductions and shortlist": P("twwqoch wO na ~ yA gl ~ mE rE cha ~ zE rE zE rE wO"),
    "Your legal identity is never part of your discovery card.":
        P("yA HE gE ga wI ~ ma nE nA tE wO ~ bA fE TSu mE ~ yA fleka ~ ka rE dE wO ~ aA ka lE ~ aA yE dA lA mE ~ ."),
    "Your message": P("mA lE aE kE tE wO"),
    "Your message could not be sent. Keep it free of contact details and try again.":
        P("mA lE aE kE tE wO ~ mA la kE ~ aA lE tA CHa lA mE ~ . ~ kA mA gA na nya ~ mA rA ja ~ nA TSa ~ ya dE rE gu tE na ~ endgna ~ ymkru ~ ."),
    "Your message was sent privately to the Kidan operator.":
        P("mA lE aE kE tE wO ~ bA sE wE rE ~ lA Kidan ~ astedari ~ tA lE kE lW lE ~ ."),
    "Your name, phone number, and verification photo are never shown in discovery.":
        P("sE mE wO ~ , ~ sE lE kE ~ qU TE rE wO na ~ yA mrgcha ~ fO tO wO ~ bA fleka ~ bA fE TSu mE ~ aA yE ta yu mE ~ ."),
    "Your photo is used only for administrator verification, is never used in discovery, and is permanently deleted 30 days after your profile is approved.":
        P("fO tO wO ~ yA mi TA qA mA mA wE ~ lA astedari ~ mrgcha ~ bcha ~ nA wE ~ , ~ bA fleka ~ bA fE TSu mE ~ aA yE TA qA mE mE ~ ,",
          "~ megelecha wO ~ kA TS dA qA ~ kA 30 ~ qA nE ~ bA HWa la mA ~ bA kWa mI nA tE ~ yE wA gA da lE ~ ."),
    "Your private details are used only for administrator verification and never appear in discovery.":
        P("yA gE lE wO ~ mA rA ja wO ~ yA mi TA qA mA mA wE ~ lA astedari ~ mrgcha ~ bcha ~ nA wE ~ , ~ bA fleka mA ~ bA fE TSu mE ~ aA yE ta yE mE ~ ."),
    "Your private reference code": P("yA gE lE wO ~ yA ma Ta qa sha ~ kO dE"),
    "Your profile": P("megelecha wO"),
    "Your profile could not be approved for this pilot":
        P("megelecha wO ~ lA zI hE ~ pa yE la tE ~ mA TSE dA qE ~ aA lE CHa lA mE"),
    "Your profile could not be approved for this pilot. See the private note below. Your details remain hidden and are not published.":
        P("megelecha wO ~ lA zI hE ~ pa yE la tE ~ mA TSE dA qE ~ aA lE CHa lA mE ~ . ~ bA ta CHE ~ ya lA wO nE ~ yA gl ~ ma sE ta wa sha ~ yE mA lE kA tu ~ .",
          "~ mA rA ja wO ~ tA dA bE qO ~ yE qO ya lE ~ , ~ lA HE zE bE mA ~ aA yE qA rE bE mE ~ ."),
    "Your profile is approved and live for values-only discovery. Your name, phone, and photo stay hidden.":
        P("megelecha wO ~ TSdqw ~ bealma ~ fleka ~ lay ~ nE qu ~ nA wE ~ . ~ sE mE wO ~ , ~ sE lE kE wO na ~ fO tO wO ~ gE nE ~ tA dA bE qA wE ~ yE qO ya lu ~ ."),
    "Your profile is in for private review": P("megelecha wO ~ lA gl ~ gE mE gA ma ~ qA rE bE tW lE"),
    "Your profile is in for private review.": P("megelecha wO ~ lA gl ~ gE mE gA ma ~ qA rE bE tW lE ~ ."),
    "Your profile would now enter private review.": P("megelecha wO ~ aA hU nE ~ wd ~ gl ~ gE mE gA ma ~ yE gA ba lE ~ ."),
    "Your public draft is saved.": P("yA HE zE bE ~ rqiq wO ~ tA qA mA gE tW lE ~ ."),
    "Your rights.": P("mA bE tO kE wO ~ ."),
    "Your saved progress changed elsewhere. Reload the latest draft?":
        P("yA tA qA mA TA wO ~ hI dA tE wO ~ bA lE la ~ bO ta ~ tA qA yE rW lE ~ . ~ yA qE rE bu nE ~ rqiq ~ endgna ~ yE cha nu ~ ?"),
    "Your short introduction will appear here.": P("aA chE rE ~ twwq wO ~ aE zI hE ~ yE ta ya lE ~ ."),
    "Your shortlist": P("yA gl ~ mE rE cha ~ zE rE zE rE wO"),
    "Your shortlist is private. Kidan never notifies anyone from a swipe, and never reveals a decline.":
        P("yA gl ~ mE rE cha ~ zE rE zE rE wO ~ gE la wI ~ nA wE ~ . ~ Kidan ~ sE lA ~ aA nE dE ~ ma nE sh ra ta tE ~ lA ma nE mE ~ aA yE sa wE qE mE ~ ,",
          "~ mA mA lA sE nE mA ~ bA fE TSu mE ~ aA yE gE lA TSE mE ~ ."),
    "Your shortlist · sent requests": P("yA gl ~ mE rE cha ~ zE rE zE rE wO ~ · ~ yA tA la ku ~ tyaqoch"),
    "Your verification photo is admin-only and is deleted 30 days after approval.":
        P("yA mrgcha ~ fO tO wO ~ lA astedari ~ bcha ~ nA wE ~ , ~ TSdqw ~ kA 30 ~ qA nE ~ bA HWa la mE ~ yE wA gA da lE ~ ."),
    "Your verification photo would remain admin-only and be scheduled for deletion 30 days after approval.":
        P("yA mrgcha ~ fO tO wO ~ lA astedari ~ bcha ~ yE qO ya lE ~ , ~ TSdqw ~ kA 30 ~ qA nE ~ bA HWa la ~ yE wA gA da lE ~ ."),
    "You’ve already sent a request to this person.": P("lA zI hE ~ sA wE ~ qA dE mA wE ~ tyaq ~ lE kA wA lE ~ ."),
    "e.g. Public health": P("lA mE sa le ~ yA HE zE bE ~ te na"),
    "values first": P("bealma ~ qE dE mi ya"),
    "{code} is ready when you are": P("{code} ~ aE rE sE wO ~ zE gE ju ~ sI hO nu ~ zE gE ju ~ nA wE"),
    "{left} of {cap} requests left today": P("kA {cap} ~ tyaqoch ~ yA mi qA ru tE ~ {left} ~ zare"),
    "{n} messages": P("{n} ~ mA lE aE kE tE wO kE"),
    "{n} more day": P("tA cha ma rI ~ {n} ~ qA nE"),
    "{n} more days": P("tA cha ma rI ~ {n} ~ qA na tE"),
    "{n} more message between you": P("aE rE sE ~ bA aE rE sE ~ {n} ~ mA lE aE kE tE wO kE ~ yE qA ra lu"),
    "{n} more messages between you": P("aE rE sE ~ bA aE rE sE ~ {n} ~ mA lE aE kE tE wO kE ~ yE qA ra lu"),
    "{n} of {m}": P("{n} ~ kA {m}"),
    "{n}d": P("{n} ~ qA nE"),
    "✓ Photo uploaded — tap to replace": P("✓ ~ fO tO ~ gA bE tW lE ~ — ~ lA mA qA yA rE ~ yE nE ku"),
})
