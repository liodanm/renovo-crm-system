# Overture Maps South Florida coverage experiment

**This is an isolated experiment, not part of the Renovo application.**
Nothing in this folder is imported by, or imports, any production Renovo
code. It has its own dependencies (Python + DuckDB), installed separately
from Renovo's Node/npm dependency graph — running this does **not** touch
`package.json`, the Prisma schema, or anything else in the repo outside
this directory.

It exists to answer one question with real evidence, not documentation
or assumptions: **does Overture Maps actually have usable `num_floors`,
`facade_material`, `roof_material`, `roof_shape`, and `height` data for
ordinary South Florida residential properties?**

---

## Why this exists (context)

Renovo's real Property Intelligence currently only reliably provides
building square footage (from OSM/Overpass) — no stories, no exterior
material, no property type. Two other free candidates were investigated
and ruled out or left unverified:

- **Broward County's public GIS** — directly tested live; as of a
  2026-06-06 migration, the public endpoint now exposes only the parcel
  ID (`FOLIO`), nothing else. Dead end, confirmed, not assumed.
- **Overture Maps** — the schema genuinely has the right fields, but
  real-world coverage for ordinary houses (vs. notable/large buildings)
  is unverified. **This experiment is that verification.**

This was attempted from an AI sandbox first; both `overturemaps-us-west-2.s3.amazonaws.com`
and `extensions.duckdb.org` were blocked at the sandbox's network layer
(confirmed via direct `curl`, `x-deny-reason: host_not_allowed`). This
harness is built to run from a normal machine with unrestricted internet
access instead — yours.

---

## Prerequisites

- Python 3.9+
- Internet access to:
  - `overturemaps-us-west-2.s3.amazonaws.com` (the actual data — free, no API key, no AWS account needed, public unsigned S3 access)
  - `extensions.duckdb.org` (one-time — downloads the `httpfs`/`spatial` DuckDB extensions, cached locally afterward)
  - `nominatim.openstreetmap.org` (geocoding)
  - `overpass-api.de` (OSM comparison — skip with `--skip-osm` if unavailable)

## Setup

```bash
# Optional but recommended — keeps this fully isolated from anything else on your machine
python3 -m venv venv
source venv/bin/activate      # Windows: venv\Scripts\activate

pip install duckdb
```

That's the only dependency. Not added to Renovo's `package.json` — this
is a separate Python environment entirely.

## Step 1 — Check your environment BEFORE running the real experiment

```bash
python check_env.py
```

This checks DuckDB, both extensions, and all three network endpoints
individually, so a failure points at exactly the right thing. It must
print `READY TO RUN` before you proceed — if anything fails, fix that
specific item (the script tells you the exact command) and re-run this
check, don't skip ahead.

## Step 2 — Provide real addresses

Edit `addresses.csv`. **Delete the example row first** — it's a
placeholder, not a real address, and will just show up as a geocoding
failure if left in.

Target breakdown (per the original task spec — approximate is fine,
exact counts aren't critical):

| City | Count | Notes |
|---|---|---|
| Coral Springs | 3 | single-family |
| Coral Springs | 1 | two-story |
| Coral Springs | 1 | townhome |
| Parkland | 2 | single-family |
| Fort Lauderdale | 2 | single-family |
| Weston | 2 | single-family |
| Pompano Beach | 2 | single-family |

CSV format:
```csv
id,city,state,address
cs-sf-1,Coral Springs,FL,"1234 NW 12th St, Coral Springs, FL 33071"
cs-2story-1,Coral Springs,FL,"5678 NW 34th Ave, Coral Springs, FL 33065"
...
```

Only real, public addresses — no owner names, nothing else personal.
Results are reported generically (`Property #1 — Coral Springs —
Single Family`), never by address, in the final report.

## Step 3 — Run it

```bash
python run_overture_test.py
```

Add `--skip-osm` to skip the OSM/Overpass comparison query (faster, but
you lose the "does Overture add anything beyond what we already have"
comparison, which is one of the main points of this experiment).

Expected runtime: roughly 2–4 seconds per property (mostly the
Nominatim rate limit — 1.1s enforced delay per address — plus the
Overture bounding-box query and, if enabled, the Overpass query). 15
properties ≈ 1–2 minutes.

Geocoding results are cached in `results/.geocode-cache.json` — re-running
the script after fixing something never re-hits Nominatim for addresses
already resolved.

## Output

- `results/overture-results.json` — full machine-readable detail per
  property: coordinates, matched building, every extracted field, match
  confidence and method, OSM comparison, timing.
- `results/overture-report.md` — human-readable coverage table and
  per-property summary.

Both are gitignored (see `.gitignore` in this folder) — they're your
local experiment output, not something that should end up in the repo
or get treated as production fixture data.

## Interpreting match confidence

- **high** — the geocoded point falls inside exactly one Overture
  building polygon.
- **medium** — no polygon contains the point, but the nearest building
  centroid is within 15m (a plausible geocoding-precision gap, not a
  wrong match).
- **low** — either multiple overlapping polygons contain the point
  (ambiguous — commonly stacked `building_part` records) or the
  nearest candidate is further than 15m away. Don't treat these as
  confirmed matches when computing coverage — that's covered in the
  script's stats calculation already (unmatched-confidence records
  still count toward "building match" but are flagged, matching the
  task's explicit "do not count uncertain matches as successful
  matches" instruction — check `matchConfidence` in the JSON before
  trusting a given record's field values).
- **none** — no candidate buildings in the bounding box at all.

## Troubleshooting

**`httpfs`/`spatial` extension fails to download** — you're on a
network that blocks `extensions.duckdb.org`. This is the same failure
mode this experiment hit in the original sandbox. Try a different
network, or a machine without a restrictive firewall/proxy.

**Overture query returns 0 candidates for every property** — check the
release path is still current: `OVERTURE_RELEASE` near the top of
`run_overture_test.py` is hardcoded to `2026-08-19.0` (the most recent
release confirmed via Overture's own release notes as of this
experiment's construction). Check
[docs.overturemaps.org/release-notes](https://docs.overturemaps.org/release-notes/)
for a newer one and update that constant if needed — Overture doesn't
publish a stable "latest" alias, so this does need occasional manual
updating.

**Nominatim geocoding fails for some addresses** — Nominatim's free
geocoder isn't perfect; a failed geocode for a couple of addresses out
of 15 is normal, not a bug. Those show up as `"geocodeFailed": true`
in the JSON and are excluded from coverage stats.

**Overpass query times out or fails** — Overpass's public instance can
be slow/rate-limited under load. Re-run with `--skip-osm` if this
blocks you, and add the OSM comparison back in a separate pass later.

---

## What this does NOT do

- Does not modify `PropertyIntelligenceService`, `QuoteWidgetService`,
  the frontend, the Prisma schema, or any production dependency.
- Does not add DuckDB to Renovo's runtime — it's a local Python tool
  for this experiment only.
- Does not decide anything — it produces evidence. The
  integrate/limited-fallback/don't-integrate decision happens in a
  separate report, after real numbers exist.
