# QR Code Assets — KW Atlanta Meetup

Print-ready QR code assets that point to the agent waitlist landing page:
**https://vicinities.cc/agents**

## Files

- `vicinities-cc-agents.png` — 800×800 PNG QR code, error correction level H
  (~30% recovery). Safe to overlay a small logo later if desired.
- `table-sign.html` — printable 8.5×11 letter-size sign with headline, subhead,
  QR, URL, and three benefits. Open in a browser and use **File → Print** (or
  ⌘P). Set margins to *Default* and background graphics ON.

## Recommended print sizes

| Use                                | Size          | Notes                                              |
|------------------------------------|---------------|----------------------------------------------------|
| Name tag / lanyard insert          | **4×6 in**    | QR occupies ~2.5 in square. Scan from ~30 cm.      |
| Table sign (this HTML)             | **8.5×11 in** | QR ~4.2 in square. Scan comfortably from ~1 m.     |
| Standing sign at meetup entrance   | **24×36 in**  | Upscale the PNG in Illustrator/Canva. Scan from ~2–3 m. |

The PNG is 800×800 px so it prints crisply up to ~8 in at 100 dpi.
For the 24×36 standing sign, upscale in a vector tool: place the PNG,
scale it to ~14 in square, and print on foam-core or matte poster
stock — pixelation on a QR is fine as long as the modules stay square
and high-contrast.

## Regenerating the QR code

Requires Python 3 + `qrcode` + `Pillow`.

```bash
pip install --user qrcode[pil]

python3 <<'PY'
import qrcode
from qrcode.constants import ERROR_CORRECT_H
qr = qrcode.QRCode(error_correction=ERROR_CORRECT_H, box_size=40, border=2)
qr.add_data("https://vicinities.cc/agents")
qr.make(fit=True)
img = qr.make_image(fill_color="black", back_color="white").convert("RGB")
img.resize((800, 800)).save("vicinities-cc-agents.png")
PY
```

Or, no-install fallback via qrserver.com:

```bash
curl -o vicinities-cc-agents.png \
  "https://api.qrserver.com/v1/create-qr-code/?size=800x800&ecc=H&data=https%3A%2F%2Fvicinities.cc%2Fagents"
```

## Scan reliability tips

- **Matte paper, not glossy.** Glossy stock produces glare from overhead
  fluorescents that kills scan reliability. Matte or uncoated is best.
- **High contrast.** Keep pure black on pure white. Don't tint or add a
  colored background behind the QR.
- **Quiet zone.** Never crop into the white border around the code. The
  PNG already has ~2 modules of quiet zone; keep it.
- **Scan distance.** Aim for **≥ 30 cm** phone-to-code. For the 8.5×11
  table sign that's roughly arm's length. Too close and phones can't
  focus.
- **Test before printing a batch.** Scan with iOS Camera *and* Android
  Google Lens after printing the first copy. iPhones and Pixels focus
  differently on small codes.
- **Don't laminate glossy.** If you must laminate for durability, use
  matte lamination film.

## Verification

After printing, verify the URL resolves and the landing page loads on
mobile before the meetup starts.
