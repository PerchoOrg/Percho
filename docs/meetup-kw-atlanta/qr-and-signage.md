# QR Code & Signage Guide — KW Atlanta Meetup

Everything you need to produce the QR code, table sign, and name-tag stickers
before Tuesday.

---

## 1. QR code

**Target URL:** `https://vicinities.cc/agents`

**Recommended settings:**
- Error correction level: **Q (25%)** — survives partial print smudges and
  looks fine with a small logo overlay.
- Format: **PNG** at 1024×1024 or **SVG** (preferred — scales cleanly to
  any print size).
- Foreground: `#111111` (near-black). Background: pure white.
- Quiet zone: at least 4 modules on all sides.
- Do **not** invert colors, use gradients, or shrink below ~0.8 in on print.

### Generate options

**A. Command line (fastest, no account):**

```bash
# using `qrencode` (brew install qrencode  /  apt install qrencode)
qrencode -o vicinity-agents-qr.png -s 20 -m 4 -l Q \
  "https://vicinities.cc/agents"

# SVG version (better for print)
qrencode -o vicinity-agents-qr.svg -t SVG -l Q \
  "https://vicinities.cc/agents"
```

**B. Python one-liner:**

```bash
pip install "qrcode[pil]"
python -c "import qrcode; qrcode.make('https://vicinities.cc/agents').save('vicinity-agents-qr.png')"
```

**C. Web:** qr-code-generator.com or qrcode-monkey.com. Choose PNG 1024px,
error correction "Q", download.

**Checklist before printing:**
- [ ] Scan it with two different phones (iPhone camera + Android camera).
- [ ] Scan it from ~2 feet away — that's how far a table sign sits from a
      standing agent.
- [ ] Confirm it lands on `/agents` (not the buyer home page).
- [ ] If tracking is desired, use a UTM-tagged URL (see below) *and* keep
      the redirect on your own domain — do not use bit.ly (agents distrust
      shortened links).

**UTM-tagged URL (optional):**
```
https://vicinities.cc/agents?utm_source=kw-atlanta&utm_medium=meetup&utm_campaign=first-touch
```

---

## 2. Table sign

Placed on the founder's table / booth spot at the meetup. One-way facing.

**Recommended sizes:**
- **A5 (5.8 × 8.3 in)** table tent — reads at 3–4 ft. Best for a shared
  round table where you're sitting.
- **A4 (8.3 × 11.7 in)** upright frame — reads across the room. Best if
  KW gives you a booth or a counter.
- **11 × 17 in ("tabloid") foamcore** — overkill unless you're at the door.

**Content template (top-to-bottom):**

```
┌──────────────────────────────────────────┐
│  Vicinity                                │  ← wordmark, bold
│  Video-first home discovery for Atlanta  │  ← tagline
│                                          │
│         ┌───────────────┐                │
│         │               │                │
│         │   [QR CODE]   │  ← ~2.5 in sq  │
│         │               │                │
│         └───────────────┘                │
│      Scan to join the beta               │
│      vicinities.cc/agents                │
│                                          │
│  Free during beta · Non-exclusive        │
│  100% of leads go to you                 │
└──────────────────────────────────────────┘
```

**Print notes:** matte cardstock, 100lb+ cover. Avoid glossy — QR scans
worse under harsh event lighting.

---

## 3. Wearable name-tag sticker

For the founder + teammate to wear on their shirt / lapel. KW meetups
typically hand out blank "Hello, I'm ___" stickers; bring your own if you
want branded ones.

**Recommended size:** **3 × 4 in** rectangular sticker (Avery 22820 or
similar). Or **2.625 × 1 in** (Avery 5160 address-label size) if you want
minimal.

**Content template:**

```
┌────────────────────────────┐
│  Vicinity                  │  ← small wordmark, top-left
│                            │
│  Hi, I'm                   │
│  [ FOUNDER NAME ]          │  ← handwrite, or preprint per person
│                            │
│  Ask me about video        │
│  listings for Atlanta.     │
│                            │
│      [tiny QR, 0.75 in]    │
└────────────────────────────┘
```

**Two variants to print:**
- Founder: name preprinted, "Founder" as sub-label.
- Teammate: name preprinted, "Team" or their real title as sub-label.

---

## 4. Physical bring-list for Tuesday

- [ ] 250+ business cards (see `business-card.md`)
- [ ] 2 table tents (A5) with QR
- [ ] 1 A4 backup sign (in case of counter/booth setup)
- [ ] 4 wearable name-tag stickers (2 per person, in case one falls off)
- [ ] 20 printed one-pagers (`one-pager.md` → PDF)
- [ ] Phone with the Vicinity buyer feed loaded and 3–5 sample videos ready
      to demo (offline-cached if possible — venue wifi may be flaky)
- [ ] Notebook + pen for `meetup-notes-template.md`
- [ ] Battery pack — you'll be demoing on your phone all night
