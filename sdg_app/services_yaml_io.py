from __future__ import annotations
from typing import Any, Dict, List
import yaml

def yaml_to_state(text: str) -> Dict[str, Any]:
    data = yaml.safe_load(text) or {}
    # Best-effort normalization
    models = data.get("models") or []
    blocks = data.get("blocks") or []
    connections = data.get("connections") or []

    # If models are embedded in blocks only, derive unique model list
    if not models and isinstance(blocks, list):
        seen = set()
        for b in blocks:
            m = b.get("model")
            if isinstance(m, str) and m and m not in seen:
                models.append({"id": m})
                seen.add(m)

    return {
        "models": models if isinstance(models, list) else [],
        "blocks": blocks if isinstance(blocks, list) else [],
        "connections": connections if isinstance(connections, list) else [],
    }

def state_to_yaml(state: Dict[str, Any]) -> str:
    models = state.get("models") or []
    blocks = state.get("blocks") or []
    connections = state.get("connections") or []
    doc = {
        "mabel": {"version": "1.0"},
        "models": models,
        "blocks": blocks,
    }
    if connections:
        doc["connections"] = connections
    return yaml.safe_dump(doc, sort_keys=False, allow_unicode=True)
