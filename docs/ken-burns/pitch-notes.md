# Ken Burns demo — pitch notes

Talking points for showing the Tuesday KW meetup demo. The demo video
lives at `docs/ken-burns/demo/vicinity-slideshow-demo.mp4` — save it to
your camera roll before the meetup.

## 1. This is fully automatic, ~30 seconds per listing.

"An agent uploads their listing photos, hits publish, and Vicinity
generates this video in the background — no editing app, no template
picking, no music licensing." Emphasize that every listing on the
platform gets a swipeable video from day one.

## 2. Agent-uploaded video always wins. This is the fallback.

"When an agent records a real walkthrough — even a 60-second phone
video — that beats a slideshow every time. This exists so listings
without a walkthrough don't die in the swipe feed." Positioning
matters: we're not replacing the agent's craft, we're covering the
gap so the swipe feed never has a blank card.

## 3. It doubles as a nudge inside the dashboard.

"When an agent lands on their new listing and sees this auto-generated
version already there, they're much more likely to record their own —
because now they're beating something specific instead of staring at
an empty upload button." The generated video is both the buyer-side
fallback AND the agent-side preview.

## 4. Vertical, TikTok-native, no watermark.

1080×1920, H.264, 30fps, muxed background music with a fade-out. Plays
in the swipe feed the same way as an agent-recorded video — the buyer
can't tell (and shouldn't need to care) which listings had a real
walkthrough. The ending card carries price, beds/baths/sqft, address,
and agent name so the listing is legible even if a buyer only watches
the last two seconds.

---

**If someone asks how much it costs us:** rendering is ~30 seconds of
CPU on a Lambda-sized worker per listing — pennies. We only re-render
when photos change.

**If someone asks whether buyers know it's auto-generated:** no, and
they don't need to. It's a slideshow, same as any real-estate reel on
Instagram — the difference is we made it in 30 seconds instead of 30
minutes.
