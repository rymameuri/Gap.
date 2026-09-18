import logging
from collections.abc import Awaitable, Callable, Mapping
from typing import Protocol

from app.ai.orchestration.llm_router import route_request_intelligently
from app.ai.schemas.models import (
    AgentName,
    AgentRequest,
    AgentResult,
    Intent,
    RouteDecision,
    WorkflowResponse,
)


logger = logging.getLogger(__name__)


class AgentRunner(Protocol):
    """Interface that every specialist agent must implement."""

    async def run(self, request: AgentRequest) -> AgentResult:
        ...


AsyncRouter = Callable[
    [AgentRequest],
    Awaitable[RouteDecision],
]


class AgentWorkflow:
    """Routes one request to the correct registered specialist agent."""

    def __init__(
        self,
        agents: Mapping[AgentName, AgentRunner],
        *,
        router: AsyncRouter | None = None,
    ) -> None:
        self._agents = dict(agents)
        self._router = router or route_request_intelligently

    async def run(self, request: AgentRequest) -> WorkflowResponse:
        route = await self._route_safely(request)

        if route.denied:
            return WorkflowResponse(
                route=route,
                result=self._orchestrator_result(
                    content=(
                        "That action is not available for your current role."
                    ),
                    status="denied",
                    route=route,
                ),
            )

        if route.requires_clarification:
            return WorkflowResponse(
                route=route,
                result=self._orchestrator_result(
                    content=(
                        "I’m not sure which course task you want. "
                        "Ask me to explain a topic, answer a question, "
                        "create a quiz, or check your progress."
                    ),
                    status="clarification_required",
                    route=route,
                ),
            )

        specialist = self._agents.get(route.target_agent)

        if specialist is None:
            return WorkflowResponse(
                route=route,
                result=self._orchestrator_result(
                    content=(
                        "That course capability is not available yet."
                    ),
                    status="agent_unavailable",
                    route=route,
                ),
            )

        try:
            result = await specialist.run(request)
        except Exception:
            logger.exception(
                "Specialist agent execution failed.",
                extra={
                    "target_agent": route.target_agent.value,
                    "course_id": request.course_id,
                    "user_id": request.user_id,
                },
            )

            return WorkflowResponse(
                route=route,
                result=AgentResult(
                    agent=AgentName.ORCHESTRATOR,
                    content=(
                        "I couldn’t complete that request safely. "
                        "It has been marked for review."
                    ),
                    sources=[],
                    requires_human_review=True,
                    metadata={
                        "workflow_status": "agent_execution_failed",
                        "target_agent": route.target_agent.value,
                    },
                ),
            )

        if result.agent != route.target_agent:
            logger.error(
                "Specialist returned an unexpected agent identity.",
                extra={
                    "expected_agent": route.target_agent.value,
                    "returned_agent": result.agent.value,
                },
            )

            return WorkflowResponse(
                route=route,
                result=AgentResult(
                    agent=AgentName.ORCHESTRATOR,
                    content=(
                        "I couldn’t verify which agent produced the "
                        "response. It has been marked for review."
                    ),
                    sources=[],
                    requires_human_review=True,
                    metadata={
                        "workflow_status": "agent_identity_mismatch",
                        "expected_agent": route.target_agent.value,
                        "returned_agent": result.agent.value,
                    },
                ),
            )

        return WorkflowResponse(
            route=route,
            result=result,
        )

    async def _route_safely(
        self,
        request: AgentRequest,
    ) -> RouteDecision:
        try:
            return await self._router(request)
        except Exception:
            logger.exception(
                "Request routing failed.",
                extra={
                    "course_id": request.course_id,
                    "user_id": request.user_id,
                },
            )

            return RouteDecision(
                intent=Intent.UNKNOWN,
                target_agent=AgentName.ORCHESTRATOR,
                matched_phrases=[],
                secondary_intents=[],
                requires_clarification=True,
                denied=False,
                reason=(
                    "The request could not be routed safely."
                ),
            )

    @staticmethod
    def _orchestrator_result(
        *,
        content: str,
        status: str,
        route: RouteDecision,
    ) -> AgentResult:
        return AgentResult(
            agent=AgentName.ORCHESTRATOR,
            content=content,
            sources=[],
            requires_human_review=False,
            metadata={
                "workflow_status": status,
                "target_agent": route.target_agent.value,
                "route_reason": route.reason,
            },
        )