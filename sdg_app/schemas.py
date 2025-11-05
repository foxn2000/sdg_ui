from __future__ import annotations
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field, field_validator, ConfigDict

class ModelDef(BaseModel):
    """MABEL v2 Model Definition"""
    id: str = Field(..., description="Model identifier (e.g., 'gpt-4o-mini')")
    name: Optional[str] = None
    api_model: Optional[str] = None
    api_key: Optional[str] = None
    base_url: Optional[str] = None
    organization: Optional[str] = None
    headers: Dict[str, Any] = Field(default_factory=dict)
    request_defaults: Dict[str, Any] = Field(default_factory=dict)
    capabilities: List[str] = Field(default_factory=list)
    safety: Dict[str, Any] = Field(default_factory=dict)
    provider: Optional[str] = None
    label: Optional[str] = None
    meta: Dict[str, Any] = Field(default_factory=dict)

class Block(BaseModel):
    """MABEL v2 Block Definition"""
    model_config = ConfigDict(extra='allow')
    type: str
    exec: int | None = 1
    id: Optional[str] = None
    name: Optional[str] = None
    model: Optional[str] = None
    prompt: Optional[str] = None
    params: Dict[str, Any] = Field(default_factory=dict)
    run_if: Optional[Any] = None
    on_error: Optional[str] = None
    retry: Optional[Dict[str, Any]] = None
    budget: Optional[Dict[str, Any]] = None
    outputs: List[Dict[str, Any]] = Field(default_factory=list)
    extra: Dict[str, Any] = Field(default_factory=dict)

    @field_validator("type")
    @classmethod
    def type_nonempty(cls, v: str) -> str:
        if not v:
            raise ValueError("type is required")
        return v

class GraphState(BaseModel):
    """MABEL v2 Graph State"""
    mabel: Dict[str, Any] = Field(default_factory=lambda: {"version": "2.0"})
    runtime: Dict[str, Any] = Field(default_factory=dict)
    globals: Dict[str, Any] = Field(default_factory=dict)
    budgets: Dict[str, Any] = Field(default_factory=dict)
    functions: Dict[str, Any] = Field(default_factory=dict)
    models: List[ModelDef] = Field(default_factory=list)
    templates: List[Dict[str, Any]] = Field(default_factory=list)
    files: List[Dict[str, Any]] = Field(default_factory=list)
    blocks: List[Block] = Field(default_factory=list)
    connections: List[Dict[str, Any]] = Field(default_factory=list)

class ImportRequest(BaseModel):
    yaml: Optional[str] = None

class ExportRequest(BaseModel):
    state: GraphState
