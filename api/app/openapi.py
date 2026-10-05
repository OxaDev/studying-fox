"""Écrit le schéma OpenAPI dans le front, qui en génère ses types (ADR 0015).

uv run python -m app.openapi
"""

import json
from pathlib import Path

from app.main import app

DESTINATION = Path(__file__).parents[2] / "front" / "src" / "api" / "openapi.json"


def main() -> None:
    schema = json.dumps(app.openapi(), ensure_ascii=False, indent=2)
    DESTINATION.write_text(schema + "\n", encoding="utf-8")
    print(f"Schéma écrit dans {DESTINATION}")


if __name__ == "__main__":
    main()
