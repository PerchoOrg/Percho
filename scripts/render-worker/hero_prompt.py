"""hero_prompt — the Seedance hero clip's prompt, chosen by a model inside a fence.

The home tour's hero clip used to render from the community pipeline's
FALLBACK_CLIP_PROMPT — no scene description, the same forward drift for every
home, and a "storefront signage" clause written for shopping strips. The owner
reviewed a filmed effect vocabulary on 2026-08-22 and set the rules this
module enforces:

  - the MODEL picks the camera move, from an approved pool only. No static
    per-room decision table ("i dont want many static rules ... give llm some
    space as well, just dont use the ones I explicitly mentioned").
  - the rejected moves are not in the pool at all: facade tilt-up and
    streetscape glide (empty sky, and Ken Burns does them free), and the
    synthetic aerial pull-away (the model invents a roofline that does not
    exist — a birdview is only allowed when the listing carries a REAL aerial
    photo, and then both endpoints of the clip are real photos).
  - the model writes scene / motion / focus. The CAMERA sentence comes from
    the lookup below — that language was tuned against Seedance 2.0 Mini and
    is what stops every clip collapsing into a dolly-in — and the mandatory
    clauses are appended verbatim by code, never paraphrased by a model.

Same architecture as apps/web/lib/poi/tour-orchestrator/seedance-prompt.ts;
kept in Python because the plan step runs here.
"""
from __future__ import annotations

import re
from typing import Any, Callable

# ── the approved pool (owner review 2026-08-22, Hero Shot Lab) ─────────────

# Ground effects: a single real photo is the FIRST frame.
CAMERA: dict[str, str] = {
    "full_frame_hold": (
        "The camera holds a completely locked, static frame with no movement, "
        "keeping the entire front of the home in frame."
    ),
    "pull_back_reveal": (
        "Camera pulls back slowly and smoothly, revealing the home's setting "
        "while keeping the home centered and fully in view."
    ),
    # slow_rise is deliberately ABSENT. Its verb is "go up", and Seedance Mini
    # treats that as an invitation to fly: on 3525 Berkeley Park (one-story,
    # 2026-08-22) it climbed into an invented drone shot — the synthetic
    # birdview the owner banned — and a $0.06 retest with softened wording
    # plus CLAUSE_GROUND_LEVEL still drifted well above "a small amount" and
    # invented a watermark. An effect that cannot be fenced is not in the pool.
    "lateral_glide": (
        "Camera glides slowly and smoothly sideways across the front of the "
        "home, keeping a level horizon, so the entire facade passes through the frame."
    ),
    "establish_push": (
        "Camera begins with the entire front of the home in frame and holds "
        "for a moment, then pushes in very slowly and smoothly toward the front entry."
    ),
    "entry_push_in": (
        "Camera pushes in very slowly and smoothly toward the covered front "
        "entry, keeping the front door centered as it slowly fills the frame."
    ),
    # walk_up is deliberately ABSENT (owner 2026-08-23, "remove walk_up for
    # now"). It was the only clause asking for a "subtle handheld feel" — an
    # instruction no wording can fence, the same class of failure that removed
    # slow_rise — and it also asked the model to TRAVEL forward along a walkway
    # from one still frame, inventing porch depth and walkway perspective it
    # never saw. On 2895 Shurburne Drive (2026-08-23) that produced a visibly
    # broken hero. establish_push reaches the same entry without either risk.
    # Birdview effects: BOTH endpoints are real photos (first + last frame).
    "birdview_descend": (
        "The camera begins high above the home looking down, then descends "
        "slowly and glides forward, settling into a level street-level view of "
        "the front of the home."
    ),
    "rise_to_birdview": (
        "The camera begins at street level facing the front of the home, then "
        "rises slowly and tilts down, revealing the home and its lot from high above."
    ),
}

BIRDVIEW_EFFECTS = frozenset({"birdview_descend", "rise_to_birdview"})

# Moves that end on the front door. Legitimate when the photo only ever showed
# part of the home, disastrous when it showed all of it: on 5122 Lower Creek
# Street (2026-08-22) the model picked entry_push_in on a complete two-story
# brick facade, so the hero clip finished filling the frame with a door and the
# buyer never saw the house. _SYSTEM had said to prefer facade moves there; a
# preference the model can talk itself out of is not a rule, hence the fence in
# choose_hero_prompt. establish_push is the substitute because it keeps the
# entry the model was reaching for — it just shows the whole home first.
ENTRY_EFFECTS = frozenset({"entry_push_in"})
FULL_FACADE_EFFECT = "establish_push"

# Mandatory clauses — verbatim, never paraphrased. The signage clause is the
# home version: what must survive on a house is its number and any yard-sign
# text, not a storefront.
CLAUSE_NO_PEOPLE = "No people appear in the frame."
CLAUSE_RIGID_GEOMETRY = (
    "Straight lines and repeating structures stay straight and evenly spaced."
)
CLAUSE_STRUCTURE = (
    "The home's structure, windows, and rooflines stay exactly as photographed; "
    "nothing is added or removed."
)
CLAUSE_TEXT = (
    "House numbers and any visible text stay unchanged; no new text, logos, "
    "or watermarks appear."
)
# Ground effects only. Without it a rise or pull-back can drift into an
# invented drone shot of a roof nobody photographed — the synthetic birdview
# the owner banned. Birdview effects are exempt: their aerial IS a real photo.
CLAUSE_GROUND_LEVEL = (
    "The camera stays below the home's roofline at all times and never looks "
    "down on the home from above."
)

MANDATORY_CLAUSES = (
    CLAUSE_NO_PEOPLE,
    CLAUSE_RIGID_GEOMETRY,
    CLAUSE_STRUCTURE,
    CLAUSE_TEXT,
)

# Same list as seedance-prompt.ts, same reason: these words bind to a dolly-in.
BANNED_WORDS = ("fast", "cinematic", "epic", "dramatic", "dynamic")
_BANNED_RE = re.compile(r"\b(" + "|".join(BANNED_WORDS) + r")\w*\b", re.IGNORECASE)

FALLBACK_SCENE = "The front of the home as photographed."
FALLBACK_MOTION = (
    "The only movement is leaves swaying gently in a light breeze and clouds "
    "drifting slowly; everything else stays completely still."
)

_SYSTEM = """You are choosing the opening camera move for ONE residential real-estate hero video clip.

The first image is the listing's hero photo — the clip's first frame will be exactly this photo. Any further images are the listing's aerial photos, candidates for a birdview move.

Return STRICT JSON only, no prose:
{
  "effect": "full_frame_hold|pull_back_reveal|lateral_glide|establish_push|entry_push_in|birdview_descend|rise_to_birdview",
  "aerial_index": the IMAGE NUMBER of the chosen aerial photo, counting every image in order (the hero photo is image 1, so the first aerial is image 2), or null,
  "full_facade": true if the hero photo shows the complete front of the home — both side walls or roof ends visible, nothing important cropped away — false if the home is attached (townhouse/row) or the photo shows only part of it,
  "scene": "one factual sentence describing what is in the hero photo",
  "motion": "one sentence naming the few things that may naturally move; end it with '; everything else stays completely still.'",
  "focus": "optional single short sentence naming what the camera should settle on, or null"
}

Rules:
- The buyer must come away having seen the WHOLE home. This outranks every other consideration.
- If full_facade is true, the clip must show the complete front of the home. Pick full_frame_hold, pull_back_reveal, lateral_glide, or establish_push. entry_push_in is FORBIDDEN when full_facade is true — it ends on a door and the buyer never sees the house. Use establish_push when you want the entry: it shows the whole home first, then moves toward it.
- entry_push_in is only for full_facade false — an attached home (townhouse/row) or a photo showing part of the home. Aim it at the FRONT DOOR, never at a garage door.
- birdview_descend / rise_to_birdview ONLY if you pick an aerial image via aerial_index, and only when that aerial clearly shows this same home and carries NO highlight rings, arrows, boundary outlines, or overlay text of any kind. Otherwise aerial_index must be null.
- scene and motion are factual descriptions, no marketing language.
- Never use the words: fast, cinematic, epic, dramatic, dynamic."""


class HeroPromptError(Exception):
    pass


def _clean_sentence(text: Any, max_len: int = 220) -> str:
    """One tidy sentence: banned words removed, whitespace collapsed, capped."""
    if not isinstance(text, str):
        return ""
    out = _BANNED_RE.sub("", text)
    out = re.sub(r"\s{2,}", " ", out).strip()
    if len(out) > max_len:
        return ""
    if out and not out.endswith((".", "!", "?")):
        out += "."
    return out


def compose_prompt(effect: str, scene: str, motion: str, focus: str = "") -> str:
    """Assemble and validate. Raises rather than emitting a non-compliant prompt."""
    camera = CAMERA.get(effect)
    if not camera:
        raise HeroPromptError(f"effect not in the approved pool: {effect!r}")
    parts = [
        scene or FALLBACK_SCENE,
        motion or FALLBACK_MOTION,
        camera,
    ]
    if focus:
        parts.append(focus)
    parts.extend(MANDATORY_CLAUSES)
    if effect not in BIRDVIEW_EFFECTS:
        parts.append(CLAUSE_GROUND_LEVEL)
    prompt = re.sub(r"\s{2,}", " ", " ".join(parts)).strip()
    banned = _BANNED_RE.search(prompt)
    if banned:
        raise HeroPromptError(f"banned word in prompt: {banned.group(0)}")
    return prompt


def fallback_hero(caption: str | None = None) -> dict[str, Any]:
    """The zero-risk hero: locked frame on the photo itself. Never raises."""
    scene = _clean_sentence(caption) or FALLBACK_SCENE
    return {
        "effect": "full_frame_hold",
        "prompt": compose_prompt("full_frame_hold", scene, FALLBACK_MOTION),
        "pair_photo_id": None,
        "pair_role": None,
    }


def choose_hero_prompt(
    hero_bytes: bytes,
    aerials: list[dict[str, Any]],
    caption: str | None = None,
    call: Callable[..., dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Ask the model to pick from the pool; enforce the fence; never raise.

    `aerials`: [{"id": photo_id, "bytes": ...}] — already filtered to
    aerial-looking photos by the caller. The model decides whether any of them
    is clean and actually this home.

    Returns {"effect", "prompt", "pair_photo_id", "pair_role"} — pair_* set
    only for a birdview effect. On ANY failure the locked-frame fallback comes
    back instead; the hero prompt must never fail a plan.
    """
    if call is None:
        from photo_tagger import _call_vision  # late import: network plumbing
        call = _call_vision

    try:
        images = [hero_bytes] + [a["bytes"] for a in aerials]
        out = call(_SYSTEM, "Pick the opening move for this hero photo.", images)

        effect = out.get("effect")
        if effect not in CAMERA:
            raise HeroPromptError(f"effect not in pool: {effect!r}")

        # An entry move is unlocked only by an explicit full_facade=false. A
        # missing or malformed flag substitutes too: establish_push on a
        # townhouse still opens on its front, while a door-filling clip on a
        # whole house is the failure the owner rejected.
        if effect in ENTRY_EFFECTS and out.get("full_facade") is not False:
            print(
                f"[hero_prompt] {effect} on a full facade → {FULL_FACADE_EFFECT}",
                flush=True,
            )
            effect = FULL_FACADE_EFFECT

        pair_photo_id = None
        pair_role = None
        if effect in BIRDVIEW_EFFECTS:
            idx = out.get("aerial_index")
            if isinstance(idx, str) and idx.isdigit():
                idx = int(idx)
            # Image numbering is GLOBAL: the hero is image 1, aerials start at
            # 2. The first contract ("index into the aerial images") read
            # naturally to the model as this global count — it answered 2 for
            # the only aerial — so the code now speaks the model's dialect.
            if not isinstance(idx, int) or not (2 <= idx <= len(aerials) + 1):
                raise HeroPromptError(f"birdview without a valid aerial_index: {idx!r}")
            pair_photo_id = aerials[idx - 2]["id"]
            # The clip's own photo is the ground shot. On a descend the aerial
            # OPENS the clip (pair=first); on a rise it CLOSES it (pair=last).
            pair_role = "first" if effect == "birdview_descend" else "last"

        prompt = compose_prompt(
            effect,
            _clean_sentence(out.get("scene")),
            _clean_sentence(out.get("motion")),
            _clean_sentence(out.get("focus"), max_len=120),
        )
        return {
            "effect": effect,
            "prompt": prompt,
            "pair_photo_id": pair_photo_id,
            "pair_role": pair_role,
        }
    except Exception as exc:  # noqa: BLE001 — the fallback IS the error handling
        print(f"[hero_prompt] fell back to full_frame_hold: {exc}", flush=True)
        return fallback_hero(caption)


AERIAL_KEYWORDS = ("aerial", "drone", "bird's", "birds-eye", "overhead view")


def looks_aerial(tags: dict[str, Any] | None) -> bool:
    """Cheap pre-filter over cached ai_tags; the model makes the real call."""
    if not isinstance(tags, dict):
        return False
    caption = str(tags.get("caption") or "").lower()
    return any(k in caption for k in AERIAL_KEYWORDS)
