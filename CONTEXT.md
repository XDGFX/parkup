# parkup

Finds places to park a van overnight in Brisbane by combining Brisbane City Council's parking-sign data with agent-evaluated imagery.

## Language

**Kerb stretch**:
A length of kerb governed by a single set of parking signs. The unit parkup reasons about, derived from sign points.
_Avoid_: Sign, segment, bay

**Candidate**:
A kerb stretch that parkup suggests as a possible overnight or daytime spot.
_Avoid_: Spot, suggestion, result

**Park-up**:
A spot the user has personally checked and saved to their Google Maps list. Lives outside parkup.
_Avoid_: Favourite, saved spot

**Evaluation**:
An agent's assessment of a candidate from satellite and Street View imagery, captured at a point in time.
_Avoid_: Verification, review, check

**Frontage**:
The land use a kerb stretch faces, such as residential, park, rail corridor, industrial or vacant.
_Avoid_: Zoning, neighbourhood
