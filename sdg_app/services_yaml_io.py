from __future__ import annotations
from typing import Any, Dict, List
import yaml

def yaml_to_state(text: str) -> Dict[str, Any]:
    """MABEL v2対応: YAMLからGraphStateへの変換"""
    data = yaml.safe_load(text) or {}
    
    # MABEL v2トップレベル要素の取得
    mabel = data.get("mabel") or {"version": "2.0"}
    runtime = data.get("runtime") or {}
    globals_data = data.get("globals") or {}
    budgets = data.get("budgets") or {}
    functions = data.get("functions") or {}
    models = data.get("models") or []
    templates = data.get("templates") or []
    files = data.get("files") or []
    blocks = data.get("blocks") or []
    connections = data.get("connections") or []
    
    # ブロックのoutputsを正規化（文字列配列→ディクショナリ配列）
    if isinstance(blocks, list):
        for block in blocks:
            if isinstance(block, dict) and "outputs" in block:
                outputs = block["outputs"]
                if isinstance(outputs, list):
                    normalized_outputs = []
                    for output in outputs:
                        if isinstance(output, str):
                            # 文字列の場合、nameフィールドを持つディクショナリに変換
                            normalized_outputs.append({"name": output})
                        elif isinstance(output, dict):
                            # すでにディクショナリの場合はそのまま使用
                            normalized_outputs.append(output)
                    block["outputs"] = normalized_outputs

    # モデルの正規化（idフィールドを必須化）
    if isinstance(models, list):
        normalized_models: List[Dict[str, Any]] = []
        for m in models:
            if isinstance(m, dict):
                out = dict(m)
                # nameをidとして使用（v2の仕様に合わせる）
                mid = out.get("id") or out.get("name") or out.get("api_model")
                if isinstance(mid, str) and mid.strip():
                    out["id"] = str(mid)
                    # nameフィールドも保持
                    if "name" not in out and mid:
                        out["name"] = str(mid)
                    normalized_models.append(out)
            elif isinstance(m, str):
                normalized_models.append({"id": m, "name": m})
        if normalized_models:
            models = normalized_models

    # ブロック内からモデル推測（後方互換）
    if not models and isinstance(blocks, list):
        seen = set()
        for b in blocks:
            m = b.get("model")
            if isinstance(m, str) and m and m not in seen:
                models.append({"id": m, "name": m})
                seen.add(m)

    return {
        "mabel": mabel,
        "runtime": runtime,
        "globals": globals_data,
        "budgets": budgets,
        "functions": functions,
        "models": models if isinstance(models, list) else [],
        "templates": templates if isinstance(templates, list) else [],
        "files": files if isinstance(files, list) else [],
        "blocks": blocks if isinstance(blocks, list) else [],
        "connections": connections if isinstance(connections, list) else [],
    }

def state_to_yaml(state: Dict[str, Any]) -> str:
    """MABEL v2対応: GraphStateからYAMLへの変換"""
    # MABEL v2トップレベル要素の取得
    mabel = state.get("mabel") or {"version": "2.0"}
    runtime = state.get("runtime")
    globals_data = state.get("globals")
    budgets = state.get("budgets")
    functions = state.get("functions")
    models = state.get("models") or []
    templates = state.get("templates")
    files = state.get("files")
    blocks = state.get("blocks") or []
    connections = state.get("connections") or []
    
    # YAML構造を構築
    doc: Dict[str, Any] = {"mabel": mabel}
    
    # 存在する場合のみ追加
    if runtime:
        doc["runtime"] = runtime
    if globals_data:
        doc["globals"] = globals_data
    if budgets:
        doc["budgets"] = budgets
    if functions:
        doc["functions"] = functions
    
    # モデルとブロックは必須
    doc["models"] = models
    doc["blocks"] = blocks
    
    # その他のオプション要素
    if templates:
        doc["templates"] = templates
    if files:
        doc["files"] = files
    if connections:
        doc["connections"] = connections
    
    return yaml.safe_dump(doc, sort_keys=False, allow_unicode=True)
