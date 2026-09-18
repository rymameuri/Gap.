import pytest

from app.ai.orchestration.router import route_request
from app.ai.schemas.models import (
    AgentName,
    AgentRequest,
    Intent,
    UserRole,
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


@pytest.mark.parametrize(
    ("message", "expected_intent", "expected_agent"),
    [
        (
            "Explain Newton's second law",
            Intent.EXPLAIN_TOPIC,
            AgentName.STUDY,
        ),
        (
            "Generate a quiz about forces",
            Intent.GENERATE_QUIZ,
            AgentName.ASSESSMENT,
        ),
        (
            "Check my answer",
            Intent.GRADE_ANSWER,
            AgentName.ASSESSMENT,
        ),
        (
            "Show my learning gaps",
            Intent.DIAGNOSE_GAPS,
            AgentName.DIAGNOSTIC,
        ),
        (
            "Why does acceleration increase?",
            Intent.ANSWER_QUESTION,
            AgentName.STUDY,
        ),
    ],
)
def test_routes_supported_requests(
    message: str,
    expected_intent: Intent,
    expected_agent: AgentName,
) -> None:
    decision = route_request(make_request(message))

    assert decision.intent == expected_intent
    assert decision.target_agent == expected_agent
    assert decision.denied is False


def test_student_cannot_access_class_wide_analytics() -> None:
    decision = route_request(
        make_request("Which students are at risk?")
    )

    assert decision.denied is True
    assert decision.target_agent == AgentName.ORCHESTRATOR


def test_unknown_request_requires_clarification() -> None:
    decision = route_request(make_request("Hello there"))

    assert decision.intent == Intent.UNKNOWN
    assert decision.requires_clarification is True


def test_multiple_intents_are_preserved() -> None:
    decision = route_request(
        make_request("Explain forces and generate a quiz")
    )

    assert decision.intent == Intent.GENERATE_QUIZ
    assert Intent.EXPLAIN_TOPIC in decision.secondary_intents