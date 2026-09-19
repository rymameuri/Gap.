import asyncio

from app.ai.llm.client import LLMTextResponse
from app.ai.orchestration.llm_router import (
    route_request_intelligently,
)
from app.ai.schemas.models import (
    AgentName,
    AgentRequest,
    Intent,
    UserRole,
)


class FakeLLMClient:
    def __init__(self, response_text: str) -> None:
        self.response_text = response_text
        self.calls = 0

    async def acomplete(
        self,
        messages,
        max_completion_tokens: int = 1000,
    ) -> LLMTextResponse:
        self.calls += 1

        return LLMTextResponse(
            text=self.response_text,
            model="fake-model",
            finish_reason="stop",
            prompt_tokens=10,
            completion_tokens=10,
        )


def make_request(
    message: str,
    role: UserRole = UserRole.STUDENT,
) -> AgentRequest:
    return AgentRequest(
        user_id="demo-user",
        course_id="physics-101",
        role=role,
        message=message,
    )


def test_known_intent_does_not_call_llm() -> None:
    fake = FakeLLMClient(
        '{"intent":"unknown","reason":"unused"}'
    )

    decision = asyncio.run(
        route_request_intelligently(
            make_request("Generate a quiz about forces"),
            fake,
        )
    )

    assert decision.intent == Intent.GENERATE_QUIZ
    assert decision.target_agent == AgentName.ASSESSMENT
    assert fake.calls == 0


def test_unknown_request_uses_llm_fallback() -> None:
    fake = FakeLLMClient(
        (
            '{"intent":"explain_topic",'
            '"reason":"The student wants to revisit a concept."}'
        )
    )

    decision = asyncio.run(
        route_request_intelligently(
            make_request(
                "Could we revisit Newton's first law"
            ),
            fake,
        )
    )

    assert decision.intent == Intent.EXPLAIN_TOPIC
    assert decision.target_agent == AgentName.STUDY
    assert decision.requires_clarification is False
    assert fake.calls == 1


def test_invalid_llm_output_fails_safely() -> None:
    fake = FakeLLMClient("This is not JSON")

    decision = asyncio.run(
        route_request_intelligently(
            make_request("Hello there"),
            fake,
        )
    )

    assert decision.intent == Intent.UNKNOWN
    assert decision.target_agent == AgentName.ORCHESTRATOR
    assert decision.requires_clarification is True


def test_student_class_scope_is_denied_without_llm() -> None:
    fake = FakeLLMClient(
        (
            '{"intent":"diagnose_gaps",'
            '"reason":"Class analytics requested."}'
        )
    )

    decision = asyncio.run(
        route_request_intelligently(
            make_request("Show all students in the class"),
            fake,
        )
    )

    assert decision.denied is True
    assert decision.target_agent == AgentName.ORCHESTRATOR
    assert fake.calls == 0

def test_open_ended_study_channel_request_defaults_to_study_agent() -> None:
    fake = FakeLLMClient(
        '{"intent":"unknown","reason":"unused"}'
    )
    request = make_request("Build me a revision plan from this material").model_copy(
        update={"metadata": {"channel": "study_assistant"}}
    )

    decision = asyncio.run(
        route_request_intelligently(request, fake)
    )

    assert decision.intent == Intent.ANSWER_QUESTION
    assert decision.target_agent == AgentName.STUDY
    assert decision.requires_clarification is False
    assert fake.calls == 0
