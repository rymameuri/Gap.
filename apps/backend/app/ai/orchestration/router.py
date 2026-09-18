from dataclasses import dataclass

from app.ai.schemas.models import (
    AgentName,
    AgentRequest,
    Intent,
    RouteDecision,
    UserRole,
)


@dataclass(frozen=True)
class RouteRule:
    intent: Intent
    target_agent: AgentName
    phrases: tuple[str, ...]


# Rule order defines precedence when a message contains multiple intents.
_RULES = (
    RouteRule(
        intent=Intent.GRADE_ANSWER,
        target_agent=AgentName.ASSESSMENT,
        phrases=(
            "grade my answer",
            "grade this answer",
            "mark my answer",
            "check my answer",
            "evaluate my answer",
        ),
    ),
    RouteRule(
        intent=Intent.GENERATE_QUIZ,
        target_agent=AgentName.ASSESSMENT,
        phrases=(
            "generate a quiz",
            "create a quiz",
            "make a quiz",
            "generate questions",
            "quiz me",
            "test me",
            "practice questions",
            "practice quiz",
        ),
    ),
    RouteRule(
        intent=Intent.CREATE_FOLLOW_UP,
        target_agent=AgentName.ASSESSMENT,
        phrases=(
            "follow-up question",
            "follow up question",
            "recheck this gap",
            "re-test me",
            "retest me",
            "check if i understand",
        ),
    ),
    RouteRule(
        intent=Intent.DIAGNOSE_GAPS,
        target_agent=AgentName.DIAGNOSTIC,
        phrases=(
            "knowledge gap",
            "learning gap",
            "misconception",
            "at-risk",
            "at risk",
            "struggling students",
            "class performance",
            "my progress",
            "my gaps",
        ),
    ),
    RouteRule(
        intent=Intent.EXPLAIN_TOPIC,
        target_agent=AgentName.STUDY,
        phrases=(
            "explain",
            "teach me",
            "help me understand",
            "summarise",
            "summarize",
            "worked example",
            "show an example",
            "explain the lecture",
        ),
    ),
)

_QUESTION_STARTERS = (
    "what ",
    "why ",
    "how ",
    "when ",
    "where ",
    "who ",
    "which ",
)

_CLASS_WIDE_PHRASES = (
    "which students",
    "at-risk students",
    "at risk students",
    "all students",
    "class performance",
    "class dashboard",
)


def _normalise(text: str) -> str:
    return " ".join(text.casefold().replace("’", "'").split())


def route_request(request: AgentRequest) -> RouteDecision:
    text = _normalise(request.message)
    matches: list[tuple[RouteRule, list[str]]] = []

    for rule in _RULES:
        matched_phrases = [
            phrase for phrase in rule.phrases if phrase in text
        ]

        if matched_phrases:
            matches.append((rule, matched_phrases))

    if not matches:
        if text.endswith("?") or text.startswith(_QUESTION_STARTERS):
            return RouteDecision(
                intent=Intent.ANSWER_QUESTION,
                target_agent=AgentName.STUDY,
                reason="The message has the form of a course question.",
            )

        return RouteDecision(
            intent=Intent.UNKNOWN,
            target_agent=AgentName.ORCHESTRATOR,
            requires_clarification=True,
            reason="No supported intent was detected.",
        )

    primary_rule, primary_phrases = matches[0]

    secondary_intents: list[Intent] = []

    for rule, _ in matches[1:]:
        if rule.intent not in secondary_intents:
            secondary_intents.append(rule.intent)

    # This is only an early safety check. The API must also enforce
    # permissions before returning class-wide student information.
    if (
        request.role == UserRole.STUDENT
        and primary_rule.intent == Intent.DIAGNOSE_GAPS
        and any(phrase in text for phrase in _CLASS_WIDE_PHRASES)
    ):
        return RouteDecision(
            intent=primary_rule.intent,
            target_agent=AgentName.ORCHESTRATOR,
            matched_phrases=primary_phrases,
            denied=True,
            reason="Class-wide analytics require the teacher role.",
        )

    return RouteDecision(
        intent=primary_rule.intent,
        target_agent=primary_rule.target_agent,
        matched_phrases=primary_phrases,
        secondary_intents=secondary_intents,
        reason=(
            "Matched routing phrase(s): "
            + ", ".join(primary_phrases)
        ),
    )