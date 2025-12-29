from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Dict, Optional
from enum import Enum


class AgentStatus(Enum):
    IDLE = "idle"
    PROCESSING = "processing"
    SUCCESS = "success"
    ERROR = "error"


@dataclass
class AgentResponse:
    agent_name: str
    status: AgentStatus
    result: Any
    error: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None
    timestamp: str = None
    
    def __post_init__(self):
        if self.timestamp is None:
            self.timestamp = datetime.now().isoformat()
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "agent_name": self.agent_name,
            "status": self.status.value,
            "result": self.result,
            "error": self.error,
            "metadata": self.metadata or {},
            "timestamp": self.timestamp,
        }


class BaseAgent(ABC):
    def __init__(self, name: str, description: str, config: Optional[Dict[str, Any]] = None):
        self.name = name
        self.description = description
        self.config = config or {}
        self.status = AgentStatus.IDLE
    
    @abstractmethod
    def process(self, request: Dict[str, Any]) -> AgentResponse:
        pass
    
    def get_capabilities(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "description": self.description,
            "status": self.status.value,
        }
    
    def validate_request(self, request: Dict[str, Any], required_fields: list[str]) -> None:
        missing = [field for field in required_fields if field not in request]
        if missing:
            raise ValueError(f"Missing required fields: {', '.join(missing)}")

