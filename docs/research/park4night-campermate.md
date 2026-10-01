# park4night and CamperMate: conventions

Research for [#10](https://github.com/XDGFX/parkup/issues/10). Read on 1 October 2026 from each app's own website, FAQ, terms and store listings. Where a park4night label comes from the site's own filter endpoints or script rather than a visible page, that is noted. CamperMate pages were read through a summarising fetch, so quotations longer than a short phrase are near-verbatim. Google Play would not load for CamperMate.

## Answer

- **Both apps classify by type, and the type sets the colour.** park4night has 15 place types, each with its own coloured circle icon and pin. CamperMate has 23 categories but only 4 icon colours (paid, free, activities, public amenities). Free or paid is part of the type or category, not a separate badge.
- **Neither app has a kerb or street-parking concept, and neither has a "wild vs official" flag.** park4night's types do that job ("Surrounded by nature", "Off-road (4x4)" against the motorhome-area types). CamperMate files Queensland roadside rest areas under "Free Campsites".
- **The at-a-glance rating is community-driven.** park4night shows an average out of 5 with a review count ("4.16/5", "32 Feedback"). CamperMate counts thumbs: "73 Positive / Negative 11", shown on result cards as "84% Recommended".
- **Recency means dates on everything, not a "closed" status.** park4night shows "Created on" and DD/MM/YYYY review dates. CamperMate shows "Updated Aug 2026" or "Updated 1 week ago" on the listing. Neither has a "closed", "banned" or "last visited" field. A ban shows up only as a recent review ("Je me suis fais déloger par la gendarmerie").
- **Legality is pushed onto the user.** Neither has a legality field. Both tell you to check local signage and rules, and both disclaim accuracy in their terms.
- **Neither app's data can be reused.** Neither has an open API, export or licence. CamperMate's terms ban compiling datasets from its content and using it to train AI models. park4night's terms grant no licence beyond viewing, and even say links to the site need permission.

## Classification

### park4night

The 15 types, with icon colour (labels from [the type filter](https://park4night.com/api/places/filters/type?lang=en); colours from the site's icon SVGs on `cdn6.park4night.com`):

| Colour | Types |
|---|---|
| Green | "Surrounded by nature", "Free motorhome area" |
| Blue | "Parking lot day/night", "Rest area", "Homestays accommodation", "MH parking without services" |
| Red | "Paying motorhome area" |
| Light blue | "Private car park for campers" |
| Yellow | "Off-road (4x4)" |
| Brown | "Service area without parking" |
| Purple | "Extra services" |
| Black | "On the farm (farm, vineyard ...)", "Camping" |
| Not confirmed | "Picnic area", "Daytime parking only" |

- Free or paid also appears as a "Parking cost" field ("15€/day" on [place 708519](https://park4night.com/en/place/708519); "Gratuit" on [594036](https://park4night.com/en/place/594036)).
- "Daytime parking only" is its own type. That is how a spot stays listed after overnight parking is banned (see Recency).

### CamperMate

- The operator is Outdoria Pty Ltd ([privacy policy](https://campermate.com/en/page/privacy-policy), updated 29 June 2026). thl merged CamperMate into Outdoria through a joint venture ([NZX announcement](https://www.nzx.com/announcements/333138)).
- The 23 categories are the same for Australia and NZ ([AU](https://campermate.com/en/category/au), [NZ](https://campermate.com/en/category/nz)). The ones relevant to parkup are "Free Campsites", "Paid Campsites", "Campervan Day Parking", "Rest Area", "Public Toilets", "Public Drinking Water", "Public Dump Stations" and "Public Cold/Hot Showers".
- Icon colours, from the [FAQ](https://campermate.com/en/appmenu/faqs): "Purple – Paid Campground", "Green – Free Campgrounds", "Orange - Activities", "Blue - Public Amenities such as dump stations, toilets and showers".
- Vehicle eligibility is an amenity label, not a category. NZ shows "Self-contained Vehicles Only" ([Akaroa](https://campermate.com/en/location/new-zealand/can/christchurch/free-campsites/akaroa-freedom-camping-area/28fcc7a1-1977-43e5-a288-a66a095cf0b8)). Queensland sites show "Non self-contained Vehicles".

### Mapping to parkup kinds

| parkup kind | park4night nearest | CamperMate nearest |
|---|---|---|
| Kerb stretch | none (folded into "Parking lot day/night") | none (closest is "Campervan Day Parking") |
| Parking area | "Parking lot day/night", "Rest area", "Picnic area" | "Rest Area", "Campervan Day Parking" |
| Off-road site | "Surrounded by nature", "Off-road (4x4)" | "Free Campsites" (loosely) |

## What a listing shows at a glance

**park4night** ([place 708519](https://park4night.com/en/place/708519)):
- Header: type icon, "(postcode) Name", "4.16/5", "Created on 10.08.2026 by <user>", "#708519 - Paying motorhome area".
- "6 services" as an icon row. The [17 service labels](https://park4night.com/api/places/filters/services?lang=en) include "Drinking water", "Public toilets", "Waste container", "Showers (possible access)", "3G/4G internet" and "Pets allowed".
- Fields for "Parking cost", "Price of services", "Number of places" and "Open/Closed" ("Open all year"), plus GPS, address and photos.
- Buttons: "Itinerary / Favorites / Contact / More".
- Not confirmed on the web pages: max height and altitude.

**CamperMate** ([Yamba Rest Area, Qld](https://campermate.com/en/location/australia/qld/capricorn-coast/free-campsites/yamba-rest-area/a36e408f-5f09-40b2-a165-711b8f133a76)):
- "Review Summary" with "73 Positive" and "Negative 11". Result cards show "84% Recommended" and "56 Reviews" ([Qld free campsites](https://campermate.com/en/category/au/free-campsites/state/queensland)).
- Amenities under "Sites & Accommodation", "Facilities", "Services" and "Policies", e.g. "Flush Toilet", "Phone Signal", "Pets by Request".
- Maximum stay appears only in the description text ("24hrs limit applies"). It is not a field.
- Contact shows the address, a map and "Get directions".
- Badges: "Top Rated", "Hot Topic", "Instant Book".

## Recency and closures

- park4night dates reviews DD/MM/YYYY and shows "Created on" for each place. Staff check every user edit before it goes live; until then the place shows "Awaiting check by an administrator" ([FAQ 27](https://park4night.com/en/faq/27)). Edits come from the app's "[MORE] > [Edit this place]" ([FAQ 22](https://park4night.com/en/faq/22)).
- park4night has no closed or prohibited status. [Place 230856](https://park4night.com/en/place/230856) is typed "Daytime parking only", and a review dated 29/05/2024 says the whole massif is now banned and the reviewer was moved on by the gendarmerie. Whether staff changed the type after that is not confirmed.
- CamperMate shows "Updated Aug 2026" or "Updated 1 week ago" on the listing and "Sep 25, 2026" on reviews. Users fix a listing with "Suggest Update" under "Contribute to this Place". The FAQ says it is "disabling icons that are no longer available" daily, and reviews are moderated "up to 10 working days". There is no dedicated closure report.

## Legality and being moved on

- park4night's [charter](https://park4night.com/en/charter): "I will make sure the place and its access are authorised by local regulations or the owner of the place." Its [terms](https://park4night.com/en/cgu) disclaim liability for "credit given to any information" on the site.
- A CamperMate free-camp banner ([Akaroa](https://campermate.com/en/location/new-zealand/can/christchurch/free-campsites/akaroa-freedom-camping-area/28fcc7a1-1977-43e5-a288-a66a095cf0b8)) says many free camps "are added by our community of users… it's important to verify local signage, regulations, permits, and any specific rules before you stay." The [terms](https://campermate.com/en/page/terms-and-conditions) disclaim accuracy (14.1) and say nothing is legal advice (14.2(b)). The 2021 app terms called coordinates "a guide only".
- Neither documents what happens when a place is later signed or gated. It relies on user edits, reviews and staff moderation.
- CamperMate alerts for road closures and fire bans are claimed only by a [secondary site](https://aussiervtrips.com/top-picks/best-free-camping-apps-australia/). Not confirmed.

## Filters and map

- **park4night** (web filter panel, from the site's `app.min.js` and `en.json`):
  - "Height limit of your vehicle:" ("No height limit", then 1.8–4.0 m)
  - "Filter types of places:"
  - "Nearby services" and "Activities nearby" (these match all ticked items; [FAQ 14](https://park4night.com/en/faq/14))
  - "Open all year" (paid tier only)
  - "Surrounded by nature", "Off-road (4x4)", "Picnic area" and "Daytime parking only" need a login to filter on.
- park4night pins: one pin image per type, with a default pin for places without a type. The map uses Leaflet; clustering is not confirmed. park4night+ (€9.99 a year; [subscription](https://park4night.com/en/subscription)) adds offline mode, search along a route, a satellite map and advanced filters.
- **CamperMate**: multi-select filters for "free and paid campsites to pet-friendly spots and amenities like toilets, showers or Wi-Fi". It "hides filters that don't match your current map view" ([iOS rebuild post](https://campermate.com/en/blog/post/getaway-guides/nz/new-campermate-app-for-ios-faster-smarter-easier-travel), November 2025). Offline maps are free ([offline maps](https://campermate.com/en/app/feature/offline-maps)). Pin shapes and clustering are not confirmed.

## Data access

- **park4night** has no public API, open data or licence. The `/api/...` addresses above are the website's own internal calls. [Terms, Article 5](https://park4night.com/en/cgu): "The Company does not grant any licence to the Website or its content", and use is "for the sole purpose of consultation". The databases are protected as the company's under French database law. Users are "not authorised to create a hypertext link to the Site… without the express authorisation of the Company."
- **CamperMate** has no open data or API. [Terms 13.3](https://campermate.com/en/page/terms-and-conditions) forbid any attempt to "scrape, crawl, harvest, data mine, or systematically or in bulk extract content". They also forbid retrieving content "to create or compile… any collection, compilation, database, directory, or dataset, or to train or improve any machine-learning or artificial-intelligence model". 13.4 claims the curated database as CamperMate's intellectual property.
- For parkup: don't import, scrape or cross-check against either app, including to brief the evaluation agent. Deep-linking a park4night place from a card is outside its terms as written.

## Worth absorbing

1. **Use pin colour for one thing only.** Both apps tie colour to type; CamperMate uses only four colours. In parkup, colour the pin by verdict and show the kind (kerb stretch, parking area, off-road site) as the pin's icon or shape. Kind should not get its own colours.
2. **A day-only state.** park4night's "Daytime parking only" and CamperMate's "Campervan Day Parking" keep a spot listed with a clear "not overnight". Sign plates already tell parkup this. Show "day only" as a prominent flag, not just as a poor verdict.
3. **Dates on the card.** The apps use dates as their freshness signal. parkup's equivalent is the evaluation date and the imagery capture date, e.g. "Evaluated Sep 2026 · imagery Nov 2025". This matters most for parking areas and off-road sites, which can be gated after the imagery was captured.
4. **Height as a flag.** park4night's main vehicle filter is height. For a parking area, a visible height barrier or boom gate is worth an evaluation flag, even for a light van.
5. **Maximum stay and cost as fields.** CamperMate buries the stay limit in free text. parkup can derive both from sign plates ("2P 7am–6pm", metered), so show them as a field on the card.
6. **One line on legality.** Both apps defer to local signage. A short "Check signs on arrival" beside the sign plates matches the convention without implying a guarantee. The absence of signs should never read as permission.
7. **Coarse verdicts suit parkup.** CamperMate's positive/negative split and "% Recommended" are closer to parkup's good/maybe/poor than park4night's averages to two decimals. Don't add stars.

## What parkup can't copy

- Review averages, review counts, "% Recommended" and dated comments. Those comments are the apps' main way of reporting a ban or a move-on.
- "Suggest Update", user edits and staff moderation. parkup's equivalent is the user's own park-up list in Google Maps.
- Community photos and "Created by <user>".
- Their data, whether imported directly or used as a cross-check (see Data access).

## Not confirmed

- park4night: max height and altitude fields (they may exist in the app only), the meaning of `top_liste` pins, clustering, and an official blog.
- CamperMate: alerts, pin shapes, clustering, the Google Play listing, and thl's current stake.
