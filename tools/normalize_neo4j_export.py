#!/usr/bin/env python3
from __future__ import annotations

import json
import sys
from pathlib import Path


def normalize_row(row):
    node = row.get("n", row.get("entry", row))
    if isinstance(node, dict) and isinstance(node.get("properties"), dict):
        return node["properties"]
    return node if isinstance(node, dict) else None


def main():
    if len(sys.argv) != 3:
        raise SystemExit(
            "Usage: python tools/normalize_neo4j_export.py "
            "input.json output.json"
        )

    source = Path(sys.argv[1])
    target = Path(sys.argv[2])

    payload = json.loads(source.read_text(encoding="utf-8"))
    rows = payload if isinstance(payload, list) else payload.get("entries", [])

    entries = [
        entry
        for entry in (normalize_row(row) for row in rows)
        if entry
    ]

    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(
        json.dumps(entries, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )

    print(f"Wrote {len(entries)} entries to {target}")


if __name__ == "__main__":
    main()
