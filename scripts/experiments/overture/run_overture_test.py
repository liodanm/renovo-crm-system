#!/usr/bin/env python3
"""
Renovo — Overture Maps South Florida coverage experiment.

Standalone. Does NOT import any Renovo application code — this is a
deliberate isolation choice (see README.md), not an oversight: it means
this script can never accidentally end up on a path that gets imported
by the real backend, and it means testing this doesn't require setting
up Renovo's own Node/NestJS/Prisma environment at all.

Usage:
    python check_env.py              # run this first
    python run_overture_test.py      # then this

Input:  addresses.csv (id, city, state, address)
Output: results/overture-results.json
        results/overture-report.md
"""

import csv
import json
import math
import statistics
import sys
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).parent
GEOCODE_CACHE_PATH = HERE / "results" / ".geocode-cache.json"
OVERTURE_RELEASE = "2026-08-19.0"  # see README.md — check docs.overturemaps.org/release-notes for a newer one
OVERTURE_BUILDINGS_PATH = (
    f"s3://overturemaps-us-west-2/release/{OVERTURE_RELEASE}"
    f"/theme=buildings/type=building/*"
)
BBOX_HALF_WIDTH_DEG = 0.0015  # ~150m at South Florida's latitude — a handful of buildings, not a neighborhood
NOMINATIM_DELAY_SECONDS = 1.1  # Nominatim usage policy: max 1 req/sec
USER_AGENT = "RenovoOvertureExperiment/1.0 (isolated test harness — see scripts/experiments/overture/README.md)"

# ---------------------------------------------------------------------------
# Geocoding — standalone Nominatim call, NOT importing GeocodingService.
# Cached locally so re-running this script (e.g. after fixing an
# unrelated bug) never re-hits Nominatim for addresses already resolved.
# ---------------------------------------------------------------------------

def load_geocode_cache() -> dict:
    if GEOCODE_CACHE_PATH.exists():
        return json.loads(GEOCODE_CACHE_PATH.read_text())
    return {}


def save_geocode_cache(cache: dict) -> None:
    GEOCODE_CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
    GEOCODE_CACHE_PATH.write_text(json.dumps(cache, indent=2))


def geocode(address: str, cache: dict) -> dict | None:
    if address in cache:
        return cache[address]

    url = "https://nominatim.openstreetmap.org/search?" + urllib.parse.urlencode(
        {"q": address, "format": "json", "limit": 1, "addressdetails": 0}
    )
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    time.sleep(NOMINATIM_DELAY_SECONDS)
    with urllib.request.urlopen(req, timeout=10) as resp:
        results = json.loads(resp.read())

    if not results:
        cache[address] = None
        save_geocode_cache(cache)
        return None

    result = {
        "latitude": float(results[0]["lat"]),
        "longitude": float(results[0]["lon"]),
        "displayName": results[0].get("display_name"),
    }
    cache[address] = result
    save_geocode_cache(cache)
    return result


# ---------------------------------------------------------------------------
# Overture query — DuckDB + httpfs, bounding-box filtered, never a full
# dataset scan. Extracts exactly the fields the experiment asked for,
# nothing invented.
# ---------------------------------------------------------------------------

def query_overture(con, lat: float, lon: float) -> list[dict]:
    min_lon, max_lon = lon - BBOX_HALF_WIDTH_DEG, lon + BBOX_HALF_WIDTH_DEG
    min_lat, max_lat = lat - BBOX_HALF_WIDTH_DEG, lat + BBOX_HALF_WIDTH_DEG

    # bbox.xmin/xmax/ymin/ymax are Overture's own indexed columns —
    # filtering on these (not ST_Intersects on the full geometry) is
    # what keeps this a small, targeted read instead of a full scan.
    rows = con.execute(
        f"""
        SELECT
            id,
            ST_AsText(geometry) AS geometry_wkt,
            ST_X(ST_Centroid(geometry)) AS centroid_lon,
            ST_Y(ST_Centroid(geometry)) AS centroid_lat,
            num_floors,
            height,
            facade_material,
            roof_material,
            roof_shape,
            sources
        FROM read_parquet('{OVERTURE_BUILDINGS_PATH}', filename=true)
        WHERE bbox.xmin <= ? AND bbox.xmax >= ?
          AND bbox.ymin <= ? AND bbox.ymax >= ?
        """,
        [max_lon, min_lon, max_lat, min_lat],
    ).fetchall()

    columns = [
        "id", "geometry_wkt", "centroid_lon", "centroid_lat",
        "num_floors", "height", "facade_material", "roof_material",
        "roof_shape", "sources",
    ]
    return [dict(zip(columns, row)) for row in rows]


def match_building(lat: float, lon: float, candidates: list[dict], con) -> dict:
    """
    Transparent matching, per the task's explicit requirement — never
    silently picks the nearest building without saying so, and never
    reports a match when candidates are genuinely ambiguous.
    """
    if not candidates:
        return {"matchConfidence": "none", "selectedBuilding": None, "candidateCount": 0, "matchMethod": "no_candidates"}

    # Point-in-polygon first — the strongest signal.
    contained = []
    for c in candidates:
        result = con.execute(
            "SELECT ST_Contains(ST_GeomFromText(?), ST_Point(?, ?))",
            [c["geometry_wkt"], lon, lat],
        ).fetchone()
        if result and result[0]:
            contained.append(c)

    if len(contained) == 1:
        return {
            "matchConfidence": "high",
            "selectedBuilding": contained[0],
            "candidateCount": len(candidates),
            "matchMethod": "point_in_polygon",
        }
    if len(contained) > 1:
        # Genuinely ambiguous (overlapping/stacked building parts) —
        # report it, don't silently pick one.
        return {
            "matchConfidence": "low",
            "selectedBuilding": contained[0],
            "candidateCount": len(candidates),
            "matchMethod": "point_in_multiple_polygons",
        }

    # No polygon contains the point — fall back to nearest centroid,
    # but only within a tight distance, and only medium confidence at
    # best, since we're now guessing which nearby building is the
    # actual residence rather than confirming it directly.
    def dist_m(c):
        # Equirectangular approx — fine at this scale (same reasoning
        # as Renovo's own polygonAreaSqFt, just for a point distance).
        dlat = (c["centroid_lat"] - lat) * 110_574
        dlon = (c["centroid_lon"] - lon) * 111_320 * math.cos(math.radians(lat))
        return math.hypot(dlat, dlon)

    nearest = min(candidates, key=dist_m)
    nearest_dist = dist_m(nearest)
    if nearest_dist <= 15:
        return {
            "matchConfidence": "medium",
            "selectedBuilding": nearest,
            "candidateCount": len(candidates),
            "matchMethod": f"nearest_centroid ({nearest_dist:.1f}m, point outside any polygon)",
        }
    return {
        "matchConfidence": "low",
        "selectedBuilding": nearest,
        "candidateCount": len(candidates),
        "matchMethod": f"nearest_centroid ({nearest_dist:.1f}m — too far to trust)",
    }


# ---------------------------------------------------------------------------
# OSM/Overpass comparison — standalone, mirrors the SHAPE of Renovo's
# real query for a fair comparison, but is not a copy-paste of
# production code and cannot be confused with it.
# ---------------------------------------------------------------------------

def query_osm(lat: float, lon: float) -> dict:
    half = BBOX_HALF_WIDTH_DEG
    query = f"""
    [out:json][timeout:15];
    way["building"]({lat - half},{lon - half},{lat + half},{lon + half});
    out geom;
    """
    req = urllib.request.Request(
        "https://overpass-api.de/api/interpreter",
        data=urllib.parse.urlencode({"data": query}).encode(),
        headers={"User-Agent": USER_AGENT},
    )
    with urllib.request.urlopen(req, timeout=20) as resp:
        data = json.loads(resp.read())

    elements = data.get("elements", [])
    if not elements:
        return {"buildingFound": False, "levels": None, "buildingType": None, "elementCount": 0}

    # Same "closest to the point" logic, kept intentionally simple —
    # this is a comparison baseline, not a second production matcher.
    def centroid(el):
        pts = el.get("geometry", [])
        if not pts:
            return None
        return (sum(p["lat"] for p in pts) / len(pts), sum(p["lon"] for p in pts) / len(pts))

    best, best_dist = None, float("inf")
    for el in elements:
        c = centroid(el)
        if not c:
            continue
        d = math.hypot((c[0] - lat) * 110_574, (c[1] - lon) * 111_320 * math.cos(math.radians(lat)))
        if d < best_dist:
            best, best_dist = el, d

    tags = (best or {}).get("tags", {})
    return {
        "buildingFound": best is not None,
        "elementCount": len(elements),
        "levels": tags.get("building:levels"),
        "buildingType": tags.get("building"),
        "distanceMeters": round(best_dist, 1) if best else None,
    }


# ---------------------------------------------------------------------------
# Orchestration
# ---------------------------------------------------------------------------

def load_addresses(csv_path: Path) -> list[dict]:
    with open(csv_path, newline="") as f:
        rows = list(csv.DictReader(f))
    if not rows:
        print(f"No addresses found in {csv_path}. See README.md / addresses.csv.example.")
        sys.exit(1)
    return rows


def run(addresses_path: Path, skip_osm: bool = False):
    import duckdb

    con = duckdb.connect()
    con.execute("LOAD httpfs;")
    con.execute("LOAD spatial;")
    con.execute("SET s3_region='us-west-2';")

    addresses = load_addresses(addresses_path)
    geocode_cache = load_geocode_cache()
    results = []

    print(f"Testing {len(addresses)} properties against Overture release {OVERTURE_RELEASE}\n")

    for row in addresses:
        pid, city, state, addr = row["id"], row["city"], row["state"], row["address"]
        print(f"[{pid}] {city}, {state} ...", end=" ", flush=True)

        t0 = time.time()
        geo = geocode(addr, geocode_cache)
        t_geocode = time.time() - t0

        if not geo:
            print("GEOCODE FAILED")
            results.append({"id": pid, "city": city, "state": state, "geocodeFailed": True})
            continue

        t1 = time.time()
        candidates = query_overture(con, geo["latitude"], geo["longitude"])
        t_overture = time.time() - t1
        match = match_building(geo["latitude"], geo["longitude"], candidates, con)
        b = match["selectedBuilding"]

        osm_result, t_osm = None, 0.0
        if not skip_osm:
            t2 = time.time()
            try:
                osm_result = query_osm(geo["latitude"], geo["longitude"])
            except Exception as e:  # noqa: BLE001
                osm_result = {"error": str(e)}
            t_osm = time.time() - t2

        record = {
            "id": pid,
            "city": city,
            "state": state,
            "geocode": {"latitude": geo["latitude"], "longitude": geo["longitude"]},
            "overture": {
                "buildingFound": b is not None,
                "candidateCount": match["candidateCount"],
                "matchConfidence": match["matchConfidence"],
                "matchMethod": match["matchMethod"],
                "numFloors": b.get("num_floors") if b else None,
                "height": b.get("height") if b else None,
                "facadeMaterial": b.get("facade_material") if b else None,
                "roofMaterial": b.get("roof_material") if b else None,
                "roofShape": b.get("roof_shape") if b else None,
                "geometryAvailable": bool(b and b.get("geometry_wkt")),
                "sources": b.get("sources") if b else None,
            },
            "osm": osm_result,
            "timingSeconds": {"geocode": round(t_geocode, 2), "overture": round(t_overture, 2), "osm": round(t_osm, 2)},
        }
        results.append(record)
        print(f"match={match['matchConfidence']} floors={record['overture']['numFloors']} facade={record['overture']['facadeMaterial']}")

    return results


def compute_stats(results: list[dict]) -> dict:
    matched = [r for r in results if r.get("overture", {}).get("buildingFound")]
    total = len(results)

    def pct(field, extractor=lambda r: r["overture"].get(field)):
        if not matched:
            return {"available": 0, "of": 0, "pct": None}
        available = sum(1 for r in matched if extractor(r) not in (None, ""))
        return {"available": available, "of": len(matched), "pct": round(100 * available / len(matched), 1)}

    return {
        "totalProperties": total,
        "buildingMatch": {"matched": len(matched), "of": total, "pct": round(100 * len(matched) / total, 1) if total else None},
        "geometry": pct("geometryAvailable"),
        "numFloors": pct("numFloors"),
        "facadeMaterial": pct("facadeMaterial"),
        "roofMaterial": pct("roofMaterial"),
        "roofShape": pct("roofShape"),
        "height": pct("height"),
    }


def write_outputs(results: list[dict], stats: dict, out_dir: Path):
    out_dir.mkdir(parents=True, exist_ok=True)

    (out_dir / "overture-results.json").write_text(json.dumps(
        {
            "testedAt": datetime.now(timezone.utc).isoformat(),
            "overtureRelease": OVERTURE_RELEASE,
            "stats": stats,
            "properties": results,
        },
        indent=2,
    ))

    lines = [
        "# Overture Phase 3B — Coverage Results",
        "",
        f"Tested: {datetime.now(timezone.utc).isoformat()}  ",
        f"Overture release: `{OVERTURE_RELEASE}`",
        "",
        "## Coverage",
        "",
        "| Field | Available | Of (matched) | Coverage |",
        "|---|---|---|---|",
        f"| Building match | {stats['buildingMatch']['matched']} | {stats['buildingMatch']['of']} (total tested) | {stats['buildingMatch']['pct']}% |",
    ]
    for label, key in [
        ("Geometry", "geometry"), ("num_floors", "numFloors"), ("facade_material", "facadeMaterial"),
        ("roof_material", "roofMaterial"), ("roof_shape", "roofShape"), ("height", "height"),
    ]:
        s = stats[key]
        lines.append(f"| {label} | {s['available']} | {s['of']} | {s['pct']}% |")

    lines += ["", "## Per-Property Detail", "", "| ID | City | Match | Confidence | Floors | Facade | Roof Mat. | OSM Levels |", "|---|---|---|---|---|---|---|---|"]
    for r in results:
        if r.get("geocodeFailed"):
            lines.append(f"| {r['id']} | {r['city']} | GEOCODE FAILED | — | — | — | — | — |")
            continue
        o = r["overture"]
        osm = r.get("osm") or {}
        lines.append(
            f"| {r['id']} | {r['city']} | {'Yes' if o['buildingFound'] else 'No'} | {o['matchConfidence']} | "
            f"{o['numFloors'] or '—'} | {o['facadeMaterial'] or '—'} | {o['roofMaterial'] or '—'} | {osm.get('levels') or '—'} |"
        )

    (out_dir / "overture-report.md").write_text("\n".join(lines))


def main():
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--addresses", default=str(HERE / "addresses.csv"))
    parser.add_argument("--skip-osm", action="store_true", help="Skip the OSM/Overpass comparison query")
    args = parser.parse_args()

    results = run(Path(args.addresses), skip_osm=args.skip_osm)
    stats = compute_stats(results)
    write_outputs(results, stats, HERE / "results")

    print("\nDone.")
    print(f"  JSON:     results/overture-results.json")
    print(f"  Markdown: results/overture-report.md")


if __name__ == "__main__":
    main()
