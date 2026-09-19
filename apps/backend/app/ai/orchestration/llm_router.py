from __future__ import annotations

import json
from collections.abc import Mapping, Sequence
from typing import Protocol

from pydantic import ValidationError

from app.ai.llm.client import (
    LLMConfigurationError,
    LLMGatewayError,
    LLMTextResponse,
    QuantumBlackLLMClient,
)
from app.ai.orchestration.router import route_request
from app.ai.prompts.router import build_router_messages
from app.ai.schemas.models import (
    AgentName,
    AgentRequest,
    Intent,
    LLMRouteOutput,
    RouteDecision,
    UserRole,
)


class AsyncCompletionClient(Protocol):
    async def acomplete(
        self,
        messages: Sequence[Mapping[str, str]],
        max_completion_tokens: int = 1000,
    ) -> LLMTextResponse:
        ...


class LLMRouteParsingError(ValueError):
    """Raised when the LLM routing output is not valid."""


_AGENT_FOR_INTENT = {
    Intent.EXPLAIN_TOPIC: AgentName.STUDY,
    Intent.ANSWER_QUESTION: AgentName.STUDY,
    Intent.GENERATE_QUIZ: AgentName.ASSESSMENT,
    Intent.GRADE_ANSWER: AgentName.ASSESSMENT,
    Intent.CREATE_FOLLOW_UP: AgentName.ASSESSMENT,
    Intent.DIAGNOSE_GAPS: AgentName.DIAGNOSTIC,
    Intent.UNKNOWN: AgentName.ORCHESTRATOR,
}

_CLASS_SCOPE_TERMS = (
    "all students",
    "other students",
    "everyone",
    "whole class",
    "class-wide",
    "classwide",
    "class dashboard",
    "student ranking",
    "which students",
    "roster",
)


def _parse_route_output(text: str) -> LLMRouteOutput:
    cleaned = text.strip()

    start = cleaned.find("{")
    end = cleaned.rfind("}")

    if start == -1 or end == -1 or end < start:
        raise LLMRouteParsingError(
            "The LLM response did not contain a JSON object."
        )

    try:
        payload = json.loads(cleaned[start : end + 1])
        return LLMRouteOutput.model_validate(payload)
    except (json.JSONDecodeError, ValidationError) as exc:
        raise LLMRouteParsingError(
            "The LLM returned an invalid routing decision."
        ) from exc


def _student_requested_class_scope(
    request: AgentRequest,
) -> bool:
    if request.role != UserRole.STUDENT:
        return False

    text = request.message.casefold()

    return any(term in text for term in _CLASS_SCOPE_TERMS)


async def route_request_intelligently(
    request: AgentRequest,
    llm_client: AsyncCompletionClient | None = None,
) -> RouteDecision:
    if _student_requested_class_scope(request):
        return RouteDecision(
            intent=Intent.DIAGNOSE_GAPS,
            target_agent=AgentName.ORCHESTRATOR,
            denied=True,
            reason="Students cannot access class-wide analytics.",
        )

    deterministic = route_request(request)

    if not deterministic.requires_clarification:
        return deterministic

    if request.metadata.get("channel") == "study_assistant":
        return RouteDecision(
            intent=Intent.ANSWER_QUESTION,
            target_agent=AgentName.STUDY,
            requires_clarification=False,
            reason=(
                "Open-ended Study Assistant request; use the grounded "
                "course Study Agent."
            ),
        )

    try:
        client = llm_client or QuantumBlackLLMClient()

        response = await client.acomplete(
            build_router_messages(request),
            max_completion_tokens=300,
        )

        llm_route = _parse_route_output(response.text)
    except (
        LLMConfigurationError,
        LLMGatewayError,
        LLMRouteParsingError,
    ):
        return deterministic.model_copy(
            update={
                "reason": (
                    deterministic.reason
                    + " The LLM fallback could not classify it safely."
                )
            }
        )

    target_agent = _AGENT_FOR_INTENT[llm_route.intent]

    return RouteDecision(
        intent=llm_route.intent,
        target_agent=target_agent,
        requires_clarification=(
            llm_route.intent == Intent.UNKNOWN
        ),
        reason=f"LLM fallback: {llm_route.reason}",
    )