#!/usr/bin/env python3
"""
Overture coverage experiment — environment/connectivity check.

Run this BEFORE run_overture_test.py. It verifies every prerequisite in
isolation, one at a time, so a failure points at exactly the right thing
instead of a confusing stack trace three steps into the real experiment.

Usage:
    python check_env.py

Exits 0 only if everything needed is actually working.
"""

import sys

OVERTURE_RELEASE = "2026-08-19.0"  # see README.md for how to check/update this
OVERTURE_BUILDINGS_PATH = (
    f"s3://overturemaps-us-west-2/release/{OVERTURE_RELEASE}"
    f"/theme=buildings/type=building/*"
)

CHECKS_PASSED = True


def check(label: str, fn):
    global CHECKS_PASSED
    print(f"  [ ] {label}...", end=" ", flush=True)
    try:
        detail = fn()
        print(f"OK{f' — {detail}' if detail else ''}")
        return True
    except Exception as e:  # noqa: BLE001 — deliberately broad, this is a diagnostic
        print(f"FAILED\n      {type(e).__name__}: {e}")
        CHECKS_PASSED = False
        return False


def check_duckdb_installed():
    import duckdb  # noqa: F401
    import duckdb as _d
    return f"duckdb {_d.__version__}"


def check_httpfs_extension():
    import duckdb
    con = duckdb.connect()
    con.execute("INSTALL httpfs;")
    con.execute("LOAD httpfs;")
    return None


def check_spatial_extension():
    import duckdb
    con = duckdb.connect()
    con.execute("INSTALL spatial;")
    con.execute("LOAD spatial;")
    return None


def check_overture_reachable():
    import duckdb
    con = duckdb.connect()
    con.execute("LOAD httpfs;")
    con.execute("SET s3_region='us-west-2';")
    # LIMIT 0 still has to open/read the parquet footer — a real
    # reachability + auth + schema-exists check, not just a ping.
    con.execute(f"SELECT * FROM read_parquet('{OVERTURE_BUILDINGS_PATH}') LIMIT 0")
    return f"release {OVERTURE_RELEASE}"


def check_nominatim_reachable():
    import urllib.request
    req = urllib.request.Request(
        "https://nominatim.openstreetmap.org/status.php",
        headers={"User-Agent": "RenovoOvertureExperiment/1.0 (isolated test harness, not production)"},
    )
    with urllib.request.urlopen(req, timeout=10) as resp:
        if resp.status != 200:
            raise RuntimeError(f"HTTP {resp.status}")
    return None


def check_overpass_reachable():
    import urllib.request
    req = urllib.request.Request(
        "https://overpass-api.de/api/status",
        headers={"User-Agent": "RenovoOvertureExperiment/1.0 (isolated test harness, not production)"},
    )
    with urllib.request.urlopen(req, timeout=10) as resp:
        if resp.status != 200:
            raise RuntimeError(f"HTTP {resp.status}")
    return None


def main():
    print("Overture coverage experiment — environment check\n")

    print("1. Local dependencies")
    if not check("duckdb Python package installed", check_duckdb_installed):
        print("\n  Fix: pip install duckdb --break-system-packages")
        print("       (or use a venv — see README.md. Not added to Renovo's")
        print("       package.json or Node dependency graph either way.)")

    print("\n2. DuckDB extensions (downloaded once, cached locally after)")
    check("httpfs extension", check_httpfs_extension)
    check("spatial extension", check_spatial_extension)

    print("\n3. Network reachability")
    check("Overture S3 data (overturemaps-us-west-2)", check_overture_reachable)
    check("Nominatim geocoder", check_nominatim_reachable)
    check("Overpass API (OSM comparison)", check_overpass_reachable)

    print()
    if CHECKS_PASSED:
        print("READY TO RUN — all checks passed. Proceed with run_overture_test.py")
        sys.exit(0)
    else:
        print("NOT READY — fix the failures above before running the real experiment.")
        print("Do not proceed past a failed check; run_overture_test.py will fail the")
        print("same way, just later and with less clear error messages.")
        sys.exit(1)


if __name__ == "__main__":
    main()
