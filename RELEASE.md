# Percho Release Notes

> The product was renamed from **Vicinity** to **Percho** on 2026-07-11.
> Versioning rule (2026-07-19+): v<major>.<minor> only. Bug fixes and polish
> appear as dated bullets under the current version and do NOT bump the number.

---

## v1.8 — One map question at a time, and the schools are on it

The map used to offer five coloured overlays: true cost, property tax,
electricity, utilities, and schools. Four of those were the same question cut
four ways — property tax and the utility bills are *parts of* what a place
costs to live in, and asking you to pick between a total and its own line items
before the map has told you anything is a choice nobody wanted to make.

There are two now. **Schools**, first, and **Cost of living**. Tap a county and
the full breakdown is still there, line by line — tax, electricity, water,
trash, insurance — each naming its own supplier and saying plainly which
figures are still our estimate. Nothing was lost; it just stopped competing
with itself for space at the top of the screen.

**Schools now appear as pins on the map.** Turn on the Schools lens and the
schools themselves show up where they actually stand, coloured by how the state
scored them. Zoom out and you see the high schools; zoom into a city and the
middle schools join them; zoom to a few streets and the elementaries appear
too. A school the state hasn't published a score for shows up grey rather than
being hidden or guessed at — you can see the school is there, and that we don't
have its number.

### 2026-09-11
- Map lenses reduced from five to two: Schools and Cost of living
- School pins on the map, coloured by state test results
- County cost breakdown unchanged and still one tap away

---

## v1.7 — The take now answers *you*, and stops burying you in figures

Comparing used to give everyone the same answer. Now it reads what you said
matters on the You tab and structures the whole comparison around it.

Put two homes side by side where one is cheaper to hold and the other has the
better schools, and Percho no longer shrugs and calls it a trade. If you've
said schools matter most, it says so and takes a side: "You said schools
matters most — so of these I'd lean 9 Elm Ave" — and then tells you exactly
what that choice costs you, because a recommendation that hides its downside
isn't advice. Say cost matters most instead and the same two homes get the
opposite answer, with the same honesty about the trade. Haven't told us
anything? It still won't choose for you.

The same goes for neighbourhoods: if getting around is your priority, you hear
what residents said about walkability rather than whatever happened to differ
most. It will never invent a difference that isn't there just because you said
you cared about it.

**Far fewer numbers.** The side-by-side table opened with up to fourteen rows
of figures. It now opens with four — the four that match what you said matters
— and everything else is behind "Show all figures". Nothing was removed; it's
just no longer the first thing you have to wade through.

**Comparing across towns is clearer.** You could always pick saved homes in
different towns, but grouping Saved by place made it look like you couldn't.
Each town's own shortcut now says "Compare these 2", and Select spells out
that different towns are fine — and tells you when your picks span more than
one.

---

## v1.6 — Saved is organised by place, the way you actually think about it

Saved used to be one long list: every home, neighbourhood and area as an
identical row, newest first. It hid the one thing that matters most — that
four of your ten saves are in the same town.

Now Saved is grouped by place. Each town gets its own section with a
swipeable row of what you saved there, and if you've saved the town itself,
its name becomes the heading and carries what a home there really costs each
month. You can see at a glance that you're really choosing between Woodstock
and Marietta, which is the decision you're actually making. Each town also
gets its own "Compare" shortcut for the homes in it.

Two new controls sit in the top right. **Filter** narrows the tab to just
homes, just neighbourhoods, or just areas — and it stays out of the way until
you tap it. **Select** lets you tick anything (up to five now, not three) and
either compare it or remove it. Removing is no longer a link on every single
row; it lives with Select, alongside compare.

Comparing five at once meant the side-by-side had to change shape: each
figure's label now sits above its row instead of in a narrow left-hand
column, so five columns still fit and nothing gets cut off.

---

## v1.5 — Comparing now gets you a suggestion, not a spreadsheet

Put two or three saved homes, neighbourhoods, or areas next to each other and
Percho no longer just lays out a table and leaves you to do the reading. It
now opens with a take — the kind of straight answer a friend who had done the
math would give you: "If it were me, I'd lean the Oak Street house — it runs
about $340 a month less and the nearby schools test stronger. The trade: it's
the older build." When the numbers genuinely don't pick a side, it says that
instead of pretending they do, and it always names what the pick gives up.
The full side-by-side figures still sit right below the take, unranked, so
you can check its work and disagree.

Getting there is one tap now. The Saved tab used to make you tap a "Compare"
label and then tick checkboxes in the list below it — an awkward two-step
that never felt like one action. Now a single card at the top of Saved offers
your homes, your neighbourhoods, and your areas each as a one-tap row. Saved
two or three homes? They ARE your shortlist — no picking step at all. Saved
more than three? You pick the ones you're torn between by tapping their
photos, right there in the card.

---

## v1.4 — Search now compares areas, not just finds addresses

Search used to answer one question: where is this address. It now answers the
one buyers actually ask first — what is it like to live in one area versus
another.

Above the map there is a row of lenses. Pick one and the map recolours every
county by that single thing: what a home really costs to own each month, the
property tax rate, how the schools test, what utilities and trash run. Dark
means more of it, and the legend and the ranked list below the map both label
which end is which, so you can read the map at a glance and then read the
numbers to be sure.

The headline lens is **true cost per month**. It prices the same $500,000 home
in every county — property tax, electric, water, trash and insurance — and
shows what each place would actually ask of you. Tap any county and it breaks
that number into its lines, so you can see where the difference comes from
rather than just that there is one. This is the thing our buyer research said
people discover only after they have moved in.

Two things it deliberately does not do. It never hides an area: a lens changes
what the map shows, not what exists, and there is still no filter anywhere on
this screen. And there is no crime or safety layer — shading a map that way
carries real fair-housing problems, and the major listing sites declined to do
it for the same reason. What neighbours actually say about a place lives in
community reviews instead.

### 2026-09-10

**No panel on the Search map at all.** Tapping a county or a city no longer
raises a strip along the bottom. Where you are now shows as a small floating
tag over the map — tap the arrow to step back out, or tap the county's name to
open its full page. The panel only appears when you type a search, which is
the one time you're actually asking for a list.

**Far more neighbourhoods on the map.** Only communities we had a photo of
were being drawn, which left a city looking almost empty. Every community we
have an outline for now appears, whether or not we have a picture of it.

**Tapping a neighbourhood opens it.** Tapping inside a community's outline was
being caught by the county underneath and bouncing you back out to the county
view. It opens the community now.

**Quieter outlines, and no empty bar.** The neighbourhood shapes were drawn
with a heavy green edge that turned busy areas into a tangle — they're a thin
line and a light wash now. The white strip that always sat at the bottom of
the Search map is gone unless it has something to tell you.

### 2026-09-09

**Neighbourhoods are drawn as neighbourhoods.** A community used to be a
circle in the same spot as everything else. Where we have the real outline —
and we do for most of them — the map now draws that shape instead, so you can
see how big a subdivision is and where it actually reaches before you open it.
County lines are always visible now too, colour or no colour.

**The map opens with no colour layer.** Search used to start with a lens
already applied, tinting every county before you'd asked anything. It now
opens plain; pick a lens when you want one, and tap it again to put it away.

**The search box says what it takes.** The hint now reads "Area, city,
community or address" — the same four steps the map itself walks.

**The map stays the map.** Tapping something on Search no longer slides a panel
up over it. Tap a county or a city and the map moves, the pins change, and the
strip at the bottom tells you where you are — pull it up yourself when you want
the list. Typing a search still opens the results, because that's what you
asked for.

**The colour scale bar is gone.** The band of numbers pinned under the lens
buttons took up the top of the map to explain the shading. Tap any county and
you get its figure instead, so the number arrives when you want it rather than
sitting there all the time.

**The map zooms in one step at a time.** Search used to show every city in the
metro at once, and tapping a photo circle only nudged the map. Now it narrows
the way you'd expect: tap a county and the map goes there and shows the cities
in it; tap a city and you get the communities and homes inside it; tap a
community or a home and you land on its page. A back link at the top of the
panel walks you out the same way you came in.

**County figures moved to their own page.** Tapping a county used to fill the
panel with its whole cost breakdown, covering the map underneath. The panel now
shows one line — that county's figure for whichever lens you're looking at —
and a link to the full page, where the breakdown and the ranked county list
live together.

**Places without a photo show their initial.** A pin we have no picture for was
a plain coloured dot, which told you something was there but not what. It now
carries the first letter of its name.

**Community pins open the community.** Tapping a community's photo circle on
the Search map used to pop a small name bubble you then had to tap again.
One tap now takes you straight to that community's page.

**The county ranking waits to be asked.** The ranked county list under the
Search map used to fill the panel the moment you pulled it up. It now appears
only when you tap one of the lens chips — until then the panel shows your
areas, and the map's colours stay as background.

**Homes on the map wear their price.** With every pin now a photo circle, a
home and a community could look alike at a glance. Each home now carries a
small price tag under its photo — "$525K", "$1.2M" — so you can tell the two
apart instantly and scan asking prices without tapping a single pin.
Communities stay a clean photo circle.

**Map pins now show the place, not a pin.** On the Search map, every spot —
city, community or home — used to be the same teardrop in a different colour.
Each one now shows its own photo in a small circle, so you can recognise a
place before you tap it. The colours still mean what they meant: they moved to
the ring around the photo, and a spot we don't have a photo for yet shows a
solid dot in its colour.

**Compare your saved neighbourhoods side by side.** Saved could already put two
or three homes next to each other, and two or three areas — but not the
neighbourhoods, which for most people is the actual shortlist. Save two and a
Compare card appears at the top of Saved: what residents rate them out of five
and on what, who lives there, and how much of each kind of place is nearby.
Nothing is ranked and there is no overall score — how much a park matters
against a short drive is your call, not ours. Anything we do not have a figure
for is left blank rather than guessed at.

**Saving something looks the same everywhere now.** The button that keeps a
home or a neighbourhood was a bookmark on the cards but a heart once you opened
one, which made it look like two different things — and a heart usually means
"like", not "keep". It is a bookmark on every screen, and it fills in when the
place is yours.

**The bookmark on a neighbourhood card works again.** Tapping it in the feed
did nothing — the button lit up under your finger and the neighbourhood never
reached your Saved list. It saves, and unsaves, the way the one on a home card
always has.

**The feed no longer names a place before it has one to name.** While the first
card loaded, the top of the feed briefly showed whichever area you had last
narrowed to — in large type, and often somewhere the cards that followed had
nothing to do with. It now stays blank for that moment and fills in with the
real place once the card is there.

**Narrowing to an area has moved to Search.** The line above the feed is now
just a label; picking which area to focus on belongs on the map, where you can
see what is actually there before choosing it.

**The property tax line now says what it leaves out.** Georgia counties levy
fire, EMS and similar services as separate districts, and the state's published
county rate does not include them — in eighteen of the twenty-nine counties on
the map. The line now says so and gives a range, because whether a particular
home pays them depends on where in the county it is. The figure itself is
unchanged; this tells you it is a floor.

**Five counties' water figures now say they are water only.** Those counties
have no county sewer utility, so their number covers water alone — which made
them look dramatically cheaper than counties whose figure includes both. The
line now says so instead of leaving you to infer it.

**Rubbish collection now shows the same figure in every county.** We had been
showing amounts that differed from county to county, and those differences were
guesses — enough to reorder more than half the utilities ranking. Georgia
publishes nothing that separates household collection from commercial, so it is
now one clearly-marked assumption, anchored on DeKalb's published annual fee,
rather than a spread of plausible-looking numbers.

**Water bills are real numbers in 28 of the 29 counties**, not figures we made
up. DeKalb's is read from the county's own rate sheet and reproduces the
typical bill DeKalb itself publishes, to the cent. The rest come from the
statewide rate survey run by the University of North Carolina's Environmental
Finance Center with the Georgia Environmental Finance Authority, and stay
marked as estimates because that survey is from 2022 and bills rise a few per
cent a year. Five counties show water only — they have no county sewer
utility, which matches how many homes there are on septic.

### 2026-09-08

**The phone feed's first card arrives about twice as fast, and almost instantly
on a second look.** Opening the app used to sit on an empty card outline for
around two seconds — sometimes four — before the first home or neighbourhood
appeared. It was waiting on four separate lookups that ran one after another
even though only one of them needed another's result; they now happen together.
Reopening within the minute is near-instant. Nothing about what you see has
changed, only how long you wait for it.

**Community videos in the phone feed now take turns.** Once you had swiped past
everything at least once, the deck could deal the same community twice in a row
while another filmed community never seemed to come up at all. Every filmed
community now appears in strict rotation — you see each of them before any of
them repeats.

**Electricity is now its own lens, and every county's figure is real.** It used
to be buried inside "Utilities & trash", where the water and rubbish estimates
dragged down the one utility number we actually know. We worked out which power
company serves each county by mapping their service areas — not by assuming the
one with the matching name — and used published federal rate data. Several of
our earlier assumptions were wrong: Gwinnett, Hall, Barrow and Jackson are
mostly Georgia Power rather than Jackson EMC, and Cherokee is mostly Amicalola.
Where a county is served by more than one company the figure is the average
across all of them, weighted by how much of the county each covers, so a county
split between two companies is no longer either guessed at or credited to
whichever one is slightly larger. All 29 counties now have a sourced number,
and the real spread between them is about $50 a month — which the old flat
estimates hid completely.

**We say exactly which part of a figure is an estimate, everywhere.** Every
screen used to carry a blanket "we haven't sourced this yet", which was unfair
to the property tax and school numbers that come straight from state records.
Now the note names the parts that are guesses and says the rest comes from
public records — and it says the same thing on the map, in the cost breakdown,
in the side-by-side comparison, on the saved list and in the review demos,
instead of each screen wording it differently. Insurance is included in that
naming: it is one flat assumption that does not vary by county, and it is no
longer quietly counted as sourced.

**The cost breakdown shows its working.** Tap a county and the electricity line
names the company and the rate behind the number — and where several companies
serve the county, it says so and names the largest rather than crediting one
company with a price it does not charge.

**The water line tells you when a county is largely on private wells.** In Pike
County about 80% of homes have no water bill at all, and in Cobb about 1 in 8.
Whether the bill applies to you is part of what living there costs.

**You can just tell Percho what matters.** A section on the You tab lets you set
how much you care about schools, what a place really costs, getting around and
the community itself. The map now opens coloured by whatever you picked, and the
compare table leads with it. If what you picked is something the map cannot show
yet — getting around, or the community itself — it opens on the usual view
rather than guessing. These only change what you see first; they never hide a
place or rule one out. This sits alongside what Percho has worked out from your
swipes: what you said and what we guessed stay separate, so the app can't
quietly talk over you.

**Saved areas carry their numbers, and show up on the map.** Each saved area
shows its county and what a home there actually costs per month. Save two or
more and a **Compare areas** card puts them side by side — monthly cost,
schools, tax, utilities — with the better figure in each row marked, and no
overall winner, on purpose: how much schools matter against cost is your call.
The ranked list on the map now also shows which of your saved places sit in
each county, so you can see where you already stand.

**You can sign in with your email and password again.** If you already have a
Percho account from the website, that password now works in the app — no
waiting for a code. The emailed code is still there for new accounts and for
when you've forgotten your password, and once you're in you can set a password
from the You tab so next time is one step.

---

## v1.3 — Opening a home now answers "does this fit me?"

The home page has been rebuilt from the ground up. Instead of a list of MLS fields, opening a home now walks you through one question — whether this home fits the way you've been searching.

- **One swipeable reel of everything.** The video tour plays first, then every photo; room chips (Kitchen · 7, Backyard · 2 …) jump you to a room, and any photo opens full-screen and uncropped or in a grid grouped by room.
- **"How it fits you."** The page compares this home against what you've saved and swiped — "More space than the homes you save: 6 of your 9 saves are under 2,800 sqft" — with the receipts for each claim, and asks "worth it, or not?" when a home costs more but gives something back.
- **What you'd actually pay.** The big number is the estimated monthly payment, broken into loan, property tax, insurance and HOA with the assumptions spelled out. Not a lending offer.
- **The essentials in one compact card** — days on market, lot size, HOA, year built, ZIP and MLS number where we have them — and the page ends with this home beside your own saved homes. A built-in "ask anything about this home" is coming next.

### 2026-09-08
- **A home's film now names the neighbourhood it's in, not its city twice.** The line above the film read "Atlanta metro › Canton" with "Canton" again underneath, because the app was only told a home's neighbourhood when that neighbourhood happened to have a film of its own — five of them do. Every home now carries its own, so it reads "Atlanta metro › Cherokee County › Canton" over "River Green", and tapping the name opens that neighbourhood

### 2026-09-07
- **The line above a film now names the county.** It reads "Atlanta metro › Gwinnett County › Duluth" over a neighbourhood or a home — the county being the thing that decides your school district and your tax rate, and the reason that line is now worth reading rather than repeating the name underneath it. A city's own film still shows just the metro and the city: a city can sit in two counties and we won't guess which
- **The county we hold for each neighbourhood was wrong near county lines and has been corrected** — 195 neighbourhoods moved, among them Peachtree Corners and several around Duluth and Marietta, which had been filed under the wrong county
- **Every home now shows the neighbourhood it's in.** Homes used to fall back to their city because we couldn't tell which neighbourhood they belonged to — only 4 of 18 were matched. All of them are now, and the match is made against every neighbourhood we have rather than the first thousand, which is what was quietly capping it. A home sitting just outside a hand-drawn neighbourhood edge still links to it; a home that isn't near any neighbourhood we know stays unlinked rather than being attached to a wrong one
- **Saved is one list again.** The Homes / Communities tabs at the top of the Saved page are gone — everything you've saved, homes, neighbourhoods and areas alike, now sits in a single list. Compare still appears once you've saved enough homes
- **Your journey now lives on the You tab.** The "Your journey" switch on the map is gone; how well you know each area — the same scores it showed — sits on the You tab under a section now titled "Your journey". The map still lists the areas you know best first
- **The Map button now appears on neighbourhood films too.** It was missing on every neighbourhood card: those cards were never told which city they belong to, so there was nowhere for the button to send you. They are now — which also means liking a neighbourhood finally counts towards that city in your journey
- **The place name sits closer to the card.** A line naming the card type sat under it for part of the day; it is gone — the card itself already says what it is — and the room went into moving the name down and closing the gap below it
- **The top of the feed now tells you where the card is, and lets you see it on a map.** Above every film: the area and the city on one quiet line, then the place itself in large type — the neighbourhood for a home or a neighbourhood tour, the city for a city card. Tap a neighbourhood's name to open its page. A new **Map** button sits right beside that name and opens the map on that place. A "what matters more to you" card reads "Your preferences / Find your balance" and has no map, because it isn't about anywhere in particular
- **A home we haven't matched to a neighbourhood yet shows its city instead**, on both lines, until we finish filling those in. Nothing is guessed from an address: a home whose location we can't place at all simply says "Explore this home" and offers no map rather than the last card's
- **A long neighbourhood name is set a little smaller rather than cut short.** Every letter shows, and the card below never moves however long the name is
- **Percho's name and the neighbourhood count have come off the feed's top line** to make room for the above. The count is still in the city picker, which the area line still opens
- **The header keeps its proportions on every iPhone** — a little bigger on a large phone, a little smaller on a small one — so the name and the Map button always take the same share of the line
- The card itself is untouched — same size, same position, same film shown whole on every current iPhone
- **A neighbourhood's photo-review page no longer breaks on an unusual place.** Opening the nearby-places panel for a home could take the whole page down whenever one of the places had been filed under a category that panel didn't recognise — a riverside spot, a civic building. The neighbourhood version of the same panel was fixed for this three weeks ago; the home version was a separate copy and never got the fix. The two are now one panel, so a fix lands once.
- **Housekeeping with no user-visible change:** unused screens and files removed across the app, the developer log and release notes trimmed to a readable size, and the automated checks that run before anything ships are passing again — they had been failing for a week.

### 2026-09-06
- **Percho's name is back at the top of the feed**, in its deep-green serif, with the metro, the current city and its neighbourhood count under it — shown for whichever city the current card belongs to.
- **The row of neighbourhood squares above the card is gone.** The top line now follows the card you're on — metro, city and (where known) neighbourhood over a home; metro and city over a neighbourhood's film — and tapping it still opens the city picker.
- **The card now sits centred on the page**, with the spare space split evenly above and below.

### 2026-09-05
- **The feed opens on the place, not on our name.** The top shows the city you're looking at, the Atlanta metro above it, neighbourhood count and typical home cost below, and a row of nearby filmed neighbourhoods — tap one to jump to its film; the one playing is ringed.
- **The tab bar's icons are whole again** — each was being clipped on its right-hand side.
- **Neighbourhood cards tell you where you are in the film.** The top-left corner names the place on screen and its distance from the neighbourhood as the film moves; sound and save sit where they do on a home card, saving a neighbourhood from the feed works again, and the name is bigger with a small "Community" label above it.
- **Home cards have lost the "Listing" tag** in the corner.
- **The four bottom tabs have been redrawn.** Feed, Search, Saved and You use a house, a compass, a heart and a waving hand, a little larger, with the active tab on a soft green pill that bounces as you switch; the Saved icon is no longer off-centre.
- **The feed's header is one tidy line** — "Atlanta metro › Dallas" without the communities count beneath it (the city picker still shows it) — and the card starts right under it.
- **A neighbourhood's page is now mostly numbers.** Nextdoor members, share who own, median age as figures; a chart of nearby places by kind, biggest first (40 gyms and studios, 39 restaurants, 31 shops, 22 schools), tap for the rest; resident ratings for quiet, walkable, neighbourly and value as four bars; the top three reasons keep their evidence in words, the rest become tags.
- **The chips on a neighbourhood's film name the kind of place, not which one** — Schools 2, Shopping 3, Parks 2 — and tapping one jumps the film there.
- **A neighbourhood's page opens like a home's.** The film fills the top with one chip per place the tour visits along its foot (the current one lit; tap another to jump), the same ← / share / ♡ and sound buttons, and no description paragraph.
- **The sound and save buttons on a card look like they belong.** They share one small pill matching the LISTING label, both icons are properly drawn, and the save mark is a bookmark that fills green once saved.

### 2026-09-04
- **The privacy policy and terms describe the real app** — accounts, tour requests, how reviews are moderated and shown without names, what usage is recorded, how to delete your account — and every review has a Report link that emails us with its reference.
- **Residents can review their neighbourhood.** Every community page has a Resident Reviews section: an overall rating, optional specifics (quiet, walkable, neighbourly, value) and a paragraph; sign-in required, one review per person per neighbourhood, shown nameless only after the team has read it. With none approved yet, the section invites the first.
- **Every tab does what its buttons say.** Search finds real homes, communities and cities by address, name or zip with map pins; Saved has a working Compare for two or three homes (price, monthly cost, size, year, HOA, typical rent, nearby schools); the feed's end-of-deck card opens the scope sheet; the You tab links to privacy, terms and support and shows the app version.
- **A home's page shows what it really costs, what it could earn, and where the kids would go.** Monthly cost uses this week's national mortgage rate plus upkeep; "If you rented it out" estimates cash flow, cap rate and yield from an editable typical rent for the ZIP; the nearest public elementary, middle and high schools show the state's test-proficiency percentage. Every figure names its source.
- **Share a home or a neighbourhood** from the ↑ button — it sends the public web page.
- **"Request a tour" now actually requests a tour.** A short form (name, email, optional phone) sends the request to an agent, who is emailed about it.
- **Percho has accounts on the phone.** Sign in with Apple or a 6-digit emailed code; saves follow you across devices; browsing never needs sign-in, and you can sign out or permanently delete your account from the You tab.

### 2026-09-03
- **Tours stop reaching for the same few pieces of music.** The whole library is in play and the least-used track wins; a film that already went out keeps its music.

### 2026-09-01
- **The buyer study is closed and its page taken down.** It ran two days and collected 10 responses.

### 2026-08-31
- **The buyer study asks one more thing at the end** — pass it to a house-hunting friend, be told when it launches, or neither — and asks for a contact if you want notifying.

### 2026-08-30
- **The feed tells you where you're looking, and lets you change it.** A line under the wordmark reads "Atlanta metro › Peachtree Corners" with community count and typical cost; tap it to pick another city, whose communities come first while everything else still shows further down.
- **You can mute a tour from the feed again.** Dragging a card shows LIKE or PASS before you let go, sound and bookmark share one control in the home card's corner, community tours get the same mute, and sound off anywhere stays off everywhere.
- **Changed your mind about a card you swiped?** The You tab lists recent likes and passes with the price and place you saw; "Bring back" returns it to your feed.
- **"You've seen everything in your area" now offers the map** — its second button had never been connected.

### 2026-08-29
- **Your either/or answers now change the feed.** Pick "newer build" and newer homes move up next, with a line saying how many did; what you swipe right on still outweighs what you answered.
- **The buyer study can be answered on the page** at percho.co/research — tap options, rate four features, leave a WeChat name, submit — and a half-finished page survives a refresh.
- **The either/or cards swipe smoothly again, and both sides show the same number of photos.**
- **The four scores on a neighborhood's page (Schools · Safety · Convenience · Growth) are gone, and so are the city card's.** They were placeholders; they'll return when real data backs them.
- **"After you move in."** A home's page carries swipeable cards of things you'd only learn after living there, researched from public records, city and school-district pages and the listing's history — the listing says 2,366 sq ft but the county says 1,820; the assigned middle school is on the replacement list; your Alpharetta address is governed by Roswell. Each is marked to watch, an upside or good to know, with a go-and-see suggestion and sources behind a tap; homes are covered in reviewed batches.
- **The either/or cards are all new — 32 questions instead of 7**, each about things you cannot have both of (newer build or older character, a yard or your Saturdays), never repeated; questions without data yet are still asked, just without counts.
- **Photos across the app are noticeably sharper** — twice the detail in the feed, the gallery and the either/or card.
- **"What matters more to you?" is back in the feed, and looks like the rest of it.** Every ninth card offers two choices, each side showing three whole, uncropped photos (three different kitchens under "Move-in ready"), with how many homes in your feed are on that side and their typical cost; swipe toward the one you want.

### 2026-08-25
- **Tap a card to pause its tour; tap again to resume.** A play mark shows while paused, it resumes where you stopped, and swiping on always starts the next card playing.
- **Opening a home or community page no longer plays two soundtracks at once** — the card goes quiet under the page and picks up when you return.

### 2026-08-23
- **Bigger cards in the feed** — about a third more card, less empty space at the edges; video quality unchanged.
- **The place name on community tour videos** now matches the size of the card's labels.

---

## v1.2 — A community tour now shows the community, not just what surrounds it

A community film used to show everything *around* a neighborhood — schools, parks, the coffee shop — but never the neighborhood itself: the gate, the pool, the clubhouse, the courts residents pay dues for. Community films now open on the community, its own amenities leading and the surrounding area as context.

- **Amenities are their own category** — pool, clubhouse, courts, playground and grounds are grouped rather than scattered among nearby businesses.
- **A community's own photography can be used**, since amenity photos rarely exist in map listings.
- **Softer photos are rescued rather than discarded** — older or smaller photos are sharpened and enlarged before the film is cut, everywhere photos are used.

Aberdeen in Suwanee is the first: a 58-second film that opens on its clubhouse and takes in the pool, courts and grounds before heading out into Suwanee.

### 2026-08-23
- **The Saved tab is real now — and holds neighborhoods, not just homes.** Homes with current price, specs and address, neighborhoods and cities all land there; prices refresh on every open, a home that has left the market says so, and an empty shelf points back to the feed. Compare is previewed and coming next.
- **Neighborhoods can be saved from their own page** with a new Save button.
- **Saving a city works now** — it appears in Saved and jumps you to it on the map.
- **The You tab shows what Percho has learned about you.** A persona card names your buyer type ("Trail-Runner Suburbanite"), an area list shows how well you know each place (tap to see it on the map), and every preference is listed with its strength and removable with a tap; Start fresh clears your history after saying what it will clear — saved homes always stay.
- **The map goes where you point.** Tapping a city pin or list row on Search flies the map there; arriving from the You tab or a saved city lands focused on that place.
- **Exploring a community keeps its film playing, and shows where it goes.** The page plays the same tour at the top and lists every place it visits, numbered to match the progress bar; tap one to jump there.
- **Counts of one read correctly** — "1 pet place", not "1 pet places".
- **A home tour's music is chosen for the home, and stays chosen.** Newer builds get the piano palette, restraint follows the home's place in its local market, a tour keeps its track across re-renders, and the track used is recorded.
- **Tapping a community film's progress bar moves the film there**, within a second of the spot you touched.
- **The phone feed keeps going once you have seen everything** — homes and communities both come back in the normal rotation.
- **Community card: the signal icons stay beside the name**, which wraps to a second line if needed.
- **The last two narration lines no longer talk over each other.** Lines are laid out with a guaranteed gap, and one with nowhere to fit is left unsaid.
- **A community film is labelled with its own community again** — amenity captions briefly carried another's name.
- **A community film shows the community's amenities, not three pictures of its houses.** Photos are grouped by what they show, so the film covers the gate, clubhouse, pool, courts and fitness room in turn, each clip labelled with its amenity, and a street of houses closes rather than opens it.
- **You can choose a home tour's opening shot yourself** — star any photo and the tour is rebuilt around it at the next plan.
- **A narration line is never cut off mid-sentence** — lines are shortened a sentence at a time; if nothing fits, the stretch plays without narration.
- **Very short stretches no longer fall back to reciting a distance**; they say what the place is.
- **Narration no longer spends most of its lines on distances** — distance must attach to something about the place and is capped at a third of lines; the Soundtrack panel flags a script that leans on it.
- **Lines that only say a place exists are gone** — the pictures run instead.
- **Community films no longer all share one narrator.** Communities get different voices, and each keeps its own for good.
- **You can pick the narrator yourself** from thirty voices in the Soundtrack panel, best-suited first; re-run Assemble to hear it — the script is not rewritten.
- **A home's opening shot shows the whole house** before moving toward the entry when the lead photo shows the complete front; townhouses and partial shots are unchanged.
- **Fetching from a community's website no longer drags in the builder's whole site.** Only the community's own pages are read; the rest are listed unticked in Photo Sources.
- **The community's photo gallery is found even when nothing links to it.**
- **Photos of a single house are kept out of community films** — one house alone, or any interior, goes to review; a streetscape still counts as the neighborhood.
- **Tagging and filtering are one step again — "Tag & Filter"** — reporting how many were described, dropped and kept.
- **A photo that cannot be described no longer holds up the review** — it lands in Pending for you to judge, with a count shown.
- **The list of candidate web pages appears before you fetch anything**, in Photo Sources as soon as research has run — the community's own site ticked, everything else waiting; earlier communities get their list too.
- **"Fetch & Tag" is now four separate steps** — Fetch POIs, Fetch Sites, Tag and Filter — each re-runnable with its own full time allowance (tagging went from about 15 photos per click to around 60); a step that runs out of time says how far it got and resumes.
- **Pulling photos from community websites is part of the pipeline.** The community's site and every page one click away is fetched automatically; other sites research found are listed but off until ticked.
- **A new Photo Sources panel** groups every page as the community's own site, pages you added, or other sites research found, with ticked and unread counts; pages already read are skipped.
- **Photos in modern web formats are no longer thrown away.**
- **A step that cannot run yet says so** on screen — "Run resolve first", "12 photos are still untagged" — and stops the sequence.
- **Filtering will not judge photos that have not been described yet.**
- When a film has room for fewer places than a community has, the pick is made on each place's score rather than list order.
- The Worker page can clean up video storage — 233 of the 282 videos in the account were unreachable copies. It lists what it would remove, with dates and lengths, and never offers a video in use or under a day old.
- Tours that stopped halfway can be closed from the same place.
- The home tour list says where a home got to and whether something is running, not how many times it has been through the pipeline.
- The home tour list's photo count says how many photos are actually in the film (or planned, or tagged, before one exists).
- A home's stage shows how far it actually got; an unfinished re-run is a note underneath, not the headline.
- Planning a community film only considers places the tour actually works on — research picks, the community's own website, and places you ruled on by hand. Apremont - Highcroft now visits Peachtree Corners Town Green, Trader Joe's, H Mart, Publix and Duluth High School.
- Photos approved by an earlier plan are stood down when a new plan does not pick them, so "approved" means "in the film".
- Pipeline step status comes from the work itself — "running" with a timer from any tab or device, "no response — re-run" if cut short, and no starting steps on top of one another.
- The third photo section in the review table is now **Pending Photos**, not "Other Photos".

### 2026-08-22
- The admin home tour list shows each home's stage, tagged-photo count, whether web and phone cuts are finished, and how long ago anything happened; homes are ordered by when the pipeline last touched them, never-processed ones after, newest first.
- The photo count in that list now counts every photo — anything past the first thousand had counted as zero.
- Each film version (web, phone) is shown on its own rather than one word for the whole home.
- Pulling photos from a community's website brings in the whole gallery — the full-size picture, not the preview, and up to 80 photos per page instead of 40. Bellmoore Park went from 6 photos to 71 including the pool, clubhouse, fitness center and tennis courts; the panel says when a page holds more than one fetch takes.
- The admin community list shows each community's stage, place count, finished films and last activity (the old count read "0 / 0" everywhere); communities are ordered by last activity, those awaiting photo review are flagged amber, and it says how many it shows out of the total.
- Searching the admin community list actually returns matches.
- A home tour's opening shot gets its own camera direction, chosen per home from a reviewed set — a locked "living photo", a slow reveal, a rise, a glide toward the front door, and more.
- With real drone photography, the opening shot can begin high above the home and settle onto its front, or lift off into the aerial view — both ends the listing's own photos.
- All 15 existing home tours were re-rendered from the sharpened, enlarged photos.
- Neighborhood cards show the film's progress as a row of segments, one per place, draggable to move through the film with the place named as you go.
- The **Explore** link on a neighborhood card pulses gently as the film nears its end.
- The four-figure summary bar (Schools, Safety, Convenience, Growth) moved off the neighborhood card onto its Explore screen; the name now sits bottom-left with **Explore** opposite, larger, lifestyle tags are small icons beside it, and long names wrap instead of being cut off.

### 2026-08-21
- Every photo is sharpened and enlarged automatically before a home tour is made, not only when the admin photo table happened to be open.
- The iPhone feed always plays the phone version of a home tour, and shows only homes and neighborhoods that have a video.
- When a photo doesn't make a home tour, the table says exactly why — which room was full, which better shot it duplicated, or that the film ran out of room.
- The phone cut and widescreen cut sit side by side on the home tour screen, with iOS and Web columns on the same row of the photo table and a player that switches between the two.
- Long steps show how long they've been running, a step that fails says so with the reason, and one that stops making progress is called out rather than spinning forever.
- Work interrupted by a restart of the video machine is picked back up automatically.
- A missing shot is named — which shot, which version, whether it's still being made, failed or never started — with what to do; a photo-table filter jumps to shots missing a clip.
- An AI-generated clip is always used in the film when one exists, and an AI hero shot requested for a home tour is actually picked up and made.
- The AI hero shot is planned automatically as every home tour's opening; reject it and it stays rejected. An AI-generated opening or closing shot can be requested, limited to those two positions.
- A listing's own photos start out approved — reviewing means dropping the few that shouldn't be in.
- Home tours produce both the phone version and the widescreen web version from the same reviewed photos and running order, on one row per photo in the review table.
- The home tour screen shows a single player at the top, matching the community tour screen, and home tour clips and films appear on the Video Jobs screen alongside every other queue.
- Home tour videos are built the same way community films are — photos labelled, kept or dropped by you, running order worked out, each shot made, film stitched. The running order (which photos, what order, how long each holds, how the camera moves) can be read and changed before anything is rendered, and each shot is made on its own so a single room can be redone.
- Home tour videos fill the card properly on iPhone — they were square, losing a third of every frame.
- The admin Worker screen is a full console for the video machine: whether each worker is running and for how long, load, memory and disk, every queue (video renders, photo clips, enhancement, reframing, paid AI) with what's waiting and what finished or failed in the last day, a plain-language verdict that speaks up only when something has stalled, live filterable logs, and a restart button that flags a worker still running pre-fix code.
- That screen opens with the essentials — the machine's activity, what just happened across every queue, the full table below — as one table with each worker's queues directly beneath it and warnings on the row they concern; AI generation cost is shown by purpose with day and week totals, and the log panel explains itself where logs don't exist.

### 2026-08-20
- Community films are now narrated — a voice walks you through what the neighbourhood has, what's nearby and what's worth the drive.
- The narration is written against the film's own cut, one line per stretch, spoken while those shots are on screen.
- Every community gets its own telling — a narrator that suits its character and stays the same every time, with an opening drawn from what makes the place distinctive.
- The music steps back under the narration and returns between lines, at a consistent level.
- The script can be read on the community tour screen before the film is made.
- Narration never describes which school anyone attends or how residents get there; school shots name the schools and describe the campuses.
- A film that can't get a script still renders with music.

### 2026-08-19
- A community film now visits about a dozen places, picked to cover different kinds — a park, a school, somewhere to eat, somewhere to shop — instead of whatever is nearest.
- The research step finds far more: Aberdeen went from 5 places across 4 kinds to 14 across 9, including restaurants, a gym and parks.
- Every shot names the place on screen, with its distance from the community when it isn't one of the community's own amenities.
- A film shows at most three shots of any one place, and visits each place once as a single stretch.
- Places of worship no longer appear in any generated film and have been removed from every community and listing — religion is a protected class in housing.
- Photos with people in them count again (a pool with swimmers, a park with families); photos where a person is the subject, or a child is recognisable, are still excluded.
- Decorative graphics from a website's own theme are no longer mistaken for photos.
- The photo table shows where each photo came from — the community's website, Google, or Street View.
- A place added to a community by hand now gets its photos pulled and reaches the film.
- Community films open with the community itself — entrance, clubhouse, pool, courts, one amenity at a time in walk-through order — and the neighbourhood follows.
- Films can now run up to 90 seconds.
- Each step of the community tour screen says when it last ran; research lists proposed places with distances and resolve shows how far each actually is, both nearest first.
- Community films stay local — nothing more than four miles away — with nearer places ranking above further ones, and research briefed to find the daily orbit: assigned schools, the everyday grocery, parks residents walk to.
- Photos from a community's own website are all used and take precedence over generic map photos of the same place.

### 2026-08-18
- Fix: the Resolve & Merge step could blank the community tour screen.
- Photos can be pulled from a community's own website by pasting the page address on its tour screen; everything on it arrives in the photo table to approve or reject.
- Communities are classified as a formally-planned subdivision or an informal neighborhood, so curated communities can be told apart from map data.

---

## v1.1 — Neighborhood tours are now planned shot by shot, not assembled by rule of thumb

A neighborhood tour used to be built by lookup — a photo tagged "landscape" always got the same treatment for the same seconds in the same place — so every tour looked like every other. Tours are now planned: each approved photo is described once (what it shows, whether anything really moves, whether people or signs are visible, time of day, how long a viewer would linger), and the plan decides which photos get real motion, depth or a slow camera move, their order, how long each holds, and what the narration says.

- **Fewer identical-looking clips.** Camera moves are picked per photo and checked against the previous clip, so the same move never lands twice in a row.
- **Films land at a consistent length** — every tour runs 45–50 seconds, spending the time on shots worth lingering on.
- **Panoramas are no longer cropped to ribbons.** A wide plaza shot keeps its whole frame.
- **AI motion is used sparingly and only where safe.** At most four clips per tour, never on a readable shop or school sign, never with people in the foreground, never inventing what wasn't in the photo — each labelled as AI-generated.
- **Narration reads as one script**, a continuous voiceover paced to the film. Nothing about school assignment is ever stated or implied.

### 2026-08-19
- Community pages load slightly faster.
- Groundwork: the automated checks that run before any change ships were not actually running and are now fixed, along with two problems they immediately caught.

### 2026-08-17
- Neighborhood tour videos are planned end to end: photo description → shot list → compliance check → narration.
- Every AI-generated clip in a tour carries an AI-generated label.
- The photo review table shows each photo's plan — its place in the film, how it will be animated, how long it holds, whether it still needs rendering.
- Photos carrying a camera watermark or date stamp are kept out of neighborhood tours.

---

## v1.0 — Percho is a swipe-feed home discovery product for US buyers, with an AI-native hub for listing agents

Percho is a mobile-first home discovery app for the whole US buyer pool. Buyers scroll a TikTok-style vertical feed of homes and the neighborhoods around them — real listings, real photos and video, plus short clips of the parks, restaurants, schools and shops actually nearby. Listing agents get a single hub that turns their photos into a home-tour video, drafts social copy in five languages across nine platforms, routes leads, and reports on what's working. Operators get an admin console that watches every pipeline behind it.

### For buyers
- **Swipe feed** — one continuous vertical stream of homes for sale, autoplaying with sound, full-viewport, with Like / Save / Contact / Share on every card.
- **Neighborhoods** — tap a badge on any listing to open its neighborhood (description, preview videos, a fullscreen swipe through the community); a "🏠 Live here" chip flips into the homes for sale there.
- **Nearby videos** — every listing's 🏘️ Nearby button opens short clips of what's around the home in 14 buyer-persona buckets (dining, groceries, parks, schools, coffee, commute and more), rendered from reviewed real-place photos with music.
- **Community as anchor** — Nearby content lives at the subdivision level, so every home in a neighborhood shares the same trustworthy clips.
- **Grids everywhere** — Explore, Saved, Search, per-community and agent pages all use the same card (cover fills, price/beds/baths/address on a soft gradient, two rows peeking onto every screen).
- **Saved, My Activity, Me** — favorite homes and neighborhoods, revisit what you've watched, and a two-button Me page (Change password / Sign out).
- **Multilingual reach** — the buyer surface is English, but agent-generated marketing copy reaches Spanish, Simplified Chinese, Vietnamese and Korean buyers on the platforms they use, including Rednote and WeChat Moments.

### For listing agents
- **Unified hub** for every listing and community — Details · Media · Marketing · Leads · Analytics, one shell with hero cover, sticky sub-tabs, auto-save and deep links.
- **Auto-generated home-tour videos** — one click on the Media tab turns a listing's photos into a ~2-minute walkthrough with a track from a curated music library, text-free and full-bleed so nothing is cropped.
- **Marketing copy generator** — nine platforms (Facebook, Instagram, Email, TikTok, X, LinkedIn, Threads, Rednote, WeChat Moments) × five languages, grounded in the listing's real description, captions and video titles; drafts save per listing, "Refine from your edits" seeds the next pass with your words, and repeats return instantly.
- **Leads inbox** — a sortable table that routes each lead back to its listing or community, with Email / SMS buttons per row that auto-mark follow-up, plus a per-listing leads panel.
- **Analytics** — Views, Leads and Conversion cards, a 7-day sparkline, a watch-through ring and a 4-step funnel (Page views → Card views → Video completes → Leads), per listing and per community.
- **One-tap creation** — a single tap makes a stub listing or community and opens its edit page; publishing requires address, price, beds, baths and one ready photo or video.
- **Instant Active ↔ Inactive** — one toggle, no draft/published/archived states; permanent delete is isolated in a red Danger zone.
- **Shared communities** — several agents can post videos to one neighborhood; each edits or deletes only their own, and others' show a "by @uploader" tag.

### For admins and operators
- **Admin console** with pipeline observability across seven tabs (Home Tour, Home Nearby, Neighborhood Nearby, POI, Video Jobs, Music and more); every list has search, sortable columns and pagination.
- **BGM library management** — import from a web catalog or upload local tracks per vibe, Approve/Reject with undo, and Purge to hard-delete rejected tracks.
- **POI photo review** — fetch photos per place in parallel, approve at the photo level (which approves the place), and filter places by whether they already have photos.
- **Home-tour job monitoring** — a per-listing hub view rather than a flat render queue, so operators see the full state of any home's tour.

### Under the hood (still non-technical)
- Fast page transitions everywhere — placeholders paint immediately and the next page pre-fetches in the background.
- Multi-agent-safe editing on shared communities — no one can overwrite another agent's uploads.
- Full mobile viewport on every feed, comfortable 44×44 tap targets, and consistent right-rail placement on every video and photo surface.

### 2026-08-14
- **Tab bar** — icons are back (a house, a magnifying glass, a bookmark and a person as light outlines above each label), and the line above the bar is fainter.
- **Cards as paper on a page** — home cards are a little narrower and shorter, sit further in from the edges on a slightly deeper warm off-white background with a soft shadow, and the video inside has gently rounded corners and an even margin on all sides.
- **Calmer card typography** — a lighter price, a darker, more readable address, softer spec greys, and a hairline rule with less space above the "Explore home" link, so price, address and tags read as one group.
- **Colour reserved for meaning** — feature tags are light tinted rectangles instead of candy-coloured capsules, the LISTING label is plain ink since green now means tappable or selected, and the Percho name at the top of the feed (both corners clear) is deep forest green.
- **Lighter, thinner icons** — the explore arrow and save bookmark are outlines, a saved home fills its bookmark white rather than green, and the photo save button is a smaller frosted disc that reads over any image.
- **Sound control** moved off the feed's top bar onto the home detail screen, where the guided tour plays.

---

## Template for future entries

## vX.Y — <headline>

<Feature summary paragraph. What users can now do that they couldn't before.>

### 2026-MM-DD
- Bug fix or small polish under this version
- Another one

### 2026-MM-DD
- More dated bullets on a later day
