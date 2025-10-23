from __future__ import annotations
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field, field_validator, ConfigDict

class ModelDef(BaseModel):
    id: str = Field(..., description="Model identifier (e.g., 'gpt-4o-mini')")
    provider: Optional[str] = None
    label: Optional[str] = None
    meta: Dict[str, Any] = Field(default_factory=dict)

class Block(BaseModel):
    model_config = ConfigDict(extra='allow')
    type: str
    exec: int | None = 1
    model: Optional[str] = None
    name: Optional[str] = None
    prompt: Optional[str] = None
    params: Dict[str, Any] = Field(default_factory=dict)
    extra: Dict[str, Any] = Field(default_factory=dict)

    @field_validator("type")
    @classmethod
    def type_nonempty(cls, v: str) -> str:
        if not v:
            raise ValueError("type is required")
        return v

class GraphState(BaseModel):
    models: List[ModelDef] = Field(default_factory=list)
    blocks: List[Block] = Field(default_factory=list)
    connections: List[Dict[str, Any]] = Field(default_factory=list)

class ImportRequest(BaseModel):
    yaml: Optional[str] = None

class ExportRequest(BaseModel):
    state: GraphState
