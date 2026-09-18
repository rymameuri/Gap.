from typing import TypedDict

from app.ai.schemas.models import (
    AgentRequest,
    AgentResult,
    RetrievedChunk,
    ReviewResult,
    RouteDecision,
)


class WorkflowState(TypedDict, total=False):
    request: AgentRequest
    route: RouteDecision
    retrieved_context: list[RetrievedChunk]
    agent_result: AgentResult
    review_result: ReviewResult
    errors: list[str]