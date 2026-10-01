# parkup

Finds places to park a van overnight in Brisbane by combining Brisbane City Council's parking-sign data with agent-evaluated imagery.

## Language

**Kerb stretch**:
A length of kerb with one set of parking rules and one frontage. The unit parkup reasons about. A change of signs or of frontage starts a new stretch; an unsigned kerb is governed by road rules alone.
_Avoid_: Sign, segment, bay

**Candidate**:
A kerb stretch or site that parkup suggests as a possible overnight or daytime spot.
_Avoid_: Spot, suggestion, result

**Site**:
A place to park off the road, with no council sign plates. Either a parking area or an off-road site.
_Avoid_: Spot, location, place

**Parking area**:
An off-street car park, sealed or gravel, open to the public.
_Avoid_: Car park lot, bay

**Off-road site**:
Unsealed ground a van can drive onto, such as a track, clearing, field edge or quarry edge.
_Avoid_: Wild spot, bush camp

**Park-up**:
A spot the user has personally checked and saved to their Google Maps list. Lives outside parkup.
_Avoid_: Favourite, saved spot

**Evaluation**:
An agent's assessment of a candidate from overhead imagery and elevation data, captured at a point in time. Judges the candidate's best section, mainly on seclusion.
_Avoid_: Verification, review, check

**Best section**:
The part of a candidate where you'd actually park, picked by its evaluation. Stored as lon/lat points; the map pin and Google Maps link go there.
_Avoid_: Best spot, sweet spot

**Calibration set**:
Known places with the user's own verdicts, re-evaluated after every rubric change to check the rubric still agrees with them.
_Avoid_: Test set, golden set

**Frontage**:
The land use a kerb stretch faces, or that a site sits in, such as residential, park, rail corridor, industrial or vacant.
_Avoid_: Zoning, neighbourhood

**Seclusion**:
How unlikely a parked van is to be noticed or objected to. The principle behind ordering candidates: more is better.
_Avoid_: Privacy, stealth
