#!/usr/bin/env python3
"""Bounded, read-only old/new MATCH plan comparison for released Lithograph.

Uses an in-memory synthetic database and exactly 80 unrelated Node candidates.
Never run the unoptimized Cartesian query on a production database or scale
this script's fixture size without a separate resource-bounded experiment.
"""

import hashlib
import json
import resource
import sqlite3
import sys
from pathlib import Path
from time import perf_counter


def scalar(db, cypher, params=None):
    result = db.execute(
        "SELECT lithograph(?,?,?)",
        (cypher, json.dumps(params or {}), "{}"),
    ).fetchone()
    return json.loads(result[0])


def main():
    if len(sys.argv) != 2:
        raise SystemExit("usage: phase38-query-baseline.py <official-lithograph-library>")
    if sqlite3.sqlite_version_info < (3, 45, 0):
        raise SystemExit("SQLite 3.45+ is required by the released Lithograph extension")
    extension = Path(sys.argv[1]).resolve(strict=True)
    checksum = hashlib.sha256(extension.read_bytes()).hexdigest()
    db = sqlite3.connect(":memory:")
    db.enable_load_extension(True)
    db.load_extension(str(extension))
    db.enable_load_extension(False)
    try:
        db.execute("SELECT lithograph_init()").fetchone()
        created = scalar(
            db,
            "CREATE " + ", ".join(f"(:Probe {{k:{i}}})" for i in range(80)) + " FINISH",
        )
        pinned_commit = created["summary"]["commit"]
        old = (
            "MATCH (a:Probe), (b:Probe) "
            "WHERE elementId(a)=$start AND elementId(b)=$end "
            "RETURN a.k AS a,b.k AS b"
        )
        new = (
            "MATCH (a:Probe) WHERE elementId(a)=$start "
            "MATCH (b:Probe) WHERE elementId(b)=$end "
            "RETURN a.k AS a,b.k AS b"
        )
        params = {"start": "n:1", "end": "n:2"}
        measured = {}
        for name, query in (("old", old), ("new", new)):
            started = perf_counter()
            explain = scalar(db, "EXPLAIN " + query, params)["rows"][0][0]
            profile = scalar(db, "PROFILE " + query, params)
            measured[name] = {
                "cypherShape": name,
                "plan": explain,
                "rows": profile["rows"],
                "dbHits": profile["summary"]["metrics"]["dbHits"],
                "wallMs": round((perf_counter() - started) * 1000, 3),
                "rssBytes": (
                    resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
                    * (1 if sys.platform == "darwin" else 1024)
                ),
            }
        assert measured["old"]["rows"] == measured["new"]["rows"] == [[0, 1]]
        assert "Cartesian" not in measured["new"]["plan"]
        if "NodeIdSeek" in measured["old"]["plan"]:
            # v0.3.5 can leave the old Cypher's Cartesian operator in
            # EXPLAIN, but both sides are indexed lookups of one node each.
            # Check actual PROFILE work, not just the operator name.
            for plan in (measured["old"]["plan"], measured["new"]["plan"]):
                assert 'NodeIdSeek { variable: "a"' in plan
                assert 'NodeIdSeek { variable: "b"' in plan
            assert measured["old"]["dbHits"] <= 12
            assert measured["new"]["dbHits"] <= 12
        else:
            # Legacy v0.3.4 scans the Cartesian candidates; the patched
            # KG OS compiler must push the first filter before scan b.
            assert "Cartesian" in measured["old"]["plan"]
            assert measured["new"]["plan"].index("Filter") < measured["new"]["plan"].index(
                'LabelIndexScan { variable: "b"'
            )
            assert measured["new"]["dbHits"] < measured["old"]["dbHits"]
        print(
            json.dumps(
                {
                    "fixture": "anonymous 80 Probe nodes, two existing endpoint IDs",
                    "sqliteVersion": sqlite3.sqlite_version,
                    "platform": sys.platform,
                    "extensionSha256": checksum,
                    "pinnedCommit": pinned_commit,
                    "nodes": 80,
                    "old": measured["old"],
                    "new": measured["new"],
                    "result": "passed",
                    "scope": "small in-memory read-query plan evidence, not OOM causality or write latency",
                },
                indent=2,
            )
        )
    finally:
        db.close()


if __name__ == "__main__":
    main()
