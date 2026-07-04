# Business Card Spec — Vicinity

Standard US business card: **3.5 in × 2 in** at 300 dpi = **1050 × 600 px**.
Bleed: add 0.125 in on each side if sending to a print shop that requires it
(final trim size stays 3.5 × 2). Safe zone: keep text 0.15 in inside the trim.

Companion file: `business-card.svg` (in this same folder) renders standalone
in any browser. Open it, screenshot / export to PDF, or send the SVG directly
to a print shop that accepts vector.

---

## FRONT

**Layout:** left 40% = logo mark; right 60% = contact block, right-aligned.

- **Logo:** "Vicinity" wordmark placeholder (top-left).
- **Founder name:** [TODO: FOUNDER FULL NAME]
- **Title:** [TODO: e.g. "Founder" or "Founder & CEO"]
- **Email:** [TODO: founder@vicinities.cc]
- **Phone:** [TODO: +1 (XXX) XXX-XXXX]
- **URL:** vicinities.cc

**Colors:**
- Background: white (#FFFFFF)
- Primary text: near-black (#111111)
- Accent (logo underline / URL): [TODO: pick brand accent, default #2563EB]

**Typography:**
- Headings/logo: geometric sans (Inter, Söhne, or similar) — bold
- Body: same family, regular, 8–10 pt

---

## BACK

**Layout:** centered vertical stack.

- **QR code square:** ~1.1 in × 1.1 in, top-center. Points to
  `https://vicinities.cc/agents`. Use ECC level M or Q; add a 4-module quiet
  zone. Generate per instructions in `qr-and-signage.md`.
- **Tagline (below QR):** *Video-first home discovery for Atlanta.*
- **One-line pitch (bottom):** *Enter the address. Upload one video. We
  deliver it to Atlanta buyers.*

Optional: tiny "vicinities.cc/agents" URL under the QR for people who
won't scan.

---

## Print notes

- Paper: 16pt matte or soft-touch coated. Avoid glossy — QR scans worse.
- Rounded corners optional (2mm radius reads modern; square is fine).
- Order 250 for the meetup + 250 spare. MOO, VistaPrint, or a local Atlanta
  printer (Puritan Press, Ellington Prints) all work.

---

## TODO checklist before printing

- [ ] Fill founder name, title, email, phone in the SVG
- [ ] Generate final QR PNG at 1050 px, drop into SVG (replace placeholder rect)
- [ ] Confirm accent color hex
- [ ] Export to PDF/X-1a for print shop, or upload SVG directly
- [ ] Order 500 units
