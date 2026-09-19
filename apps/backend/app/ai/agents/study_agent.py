import json
import re
from collections.abc import Mapping, Sequence
from typing import Protocol

from pydantic import ValidationError

from app.ai.llm.client import (
    LLMConfigurationError,
    LLMGatewayError,
    QuantumBlackLLMClient,
)
from app.ai.prompts.study import build_study_messages
from app.ai.schemas.models import (
    AgentName,
    AgentRequest,
    AgentResult,
    RetrievedChunk,
    StudyAgentOutput,
)


class TextCompletion(Protocol):
    text: str


class AsyncCompletionClient(Protocol):
    async def acomplete(
        self,
        messages: Sequence[Mapping[str, str]],
        *,
        max_completion_tokens: int,
    ) -> TextCompletion:
        ...


class CourseRetriever(Protocol):
    def course_overview(
        self,
        course_id: str,
        limit: int = 256,
    ) -> list[RetrievedChunk]:
        ...

    def search(
        self,
        *,
        course_id: str,
        query: str,
        limit: int = 5,
    ) -> list[RetrievedChunk]:
        ...


_COURSE_WIDE_PHRASES = (
    "full course",
    "whole course",
    "entire course",
    "complete course",
    "course overview",
    "overview of the course",
    "summarize the course",
    "summarise the course",
    "explain the course",
    "teach me the course",
    "walk me through the course",
    "all course material",
    "all the course material",
    "what does this course cover",
    "what is this course about",
    "what will i learn in this course",
    "what do we learn in this course",
    "all topics in the course",
    "main topics in the course",
    "everything in the course",
    "everything in this course",
    "everything about the course",
    "all of the course",
    "cover the whole course",
    "cover the entire course",
    "every topic in the course",
)


_CITATION_PATTERN = re.compile(r"\[(S\d+)\]")
_MAX_PUBLISHED_ANSWER_CHARS = 15_000


def _is_course_wide_request(message: str) -> bool:
    normalized = " ".join(message.casefold().replace("’", "'").split())
    return any(phrase in normalized for phrase in _COURSE_WIDE_PHRASES)


class StudyAgentParsingError(ValueError):
    """Raised when the Study Agent returns unusable output."""


def _unwrap_study_answer(text: str) -> str:
    """Return visible Markdown while remaining backward-compatible with JSON output."""

    stripped = text.strip()

    if not stripped:
        raise StudyAgentParsingError("The Study Agent returned empty output.")

    # Older prompts returned {"answer": ..., "used_source_ids": ...}. Accept
    # that shape during upgrades, but new prompts return Markdown directly.
    if stripped.startswith("{"):
        try:
            payload = json.loads(stripped)
        except json.JSONDecodeError as exc:
            raise StudyAgentParsingError(
                "The Study Agent returned malformed structured output."
            ) from exc

        try:
            output = StudyAgentOutput.model_validate(payload)
        except ValidationError as exc:
            raise StudyAgentParsingError(
                "The Study Agent response did not match the legacy schema."
            ) from exc

        stripped = output.answer.strip()

    if stripped.startswith("```") and stripped.endswith("```"):
        lines = stripped.splitlines()
        if len(lines) >= 3:
            stripped = "\n".join(lines[1:-1]).strip()

    if not stripped:
        raise StudyAgentParsingError("The Study Agent returned empty output.")

    return stripped


def _clip_answer(answer: str, limit: int = _MAX_PUBLISHED_ANSWER_CHARS) -> str:
    """Keep one answer safe for the next-turn history limit without cutting mid-line."""

    if len(answer) <= limit:
        return answer

    prefix = answer[:limit]
    cut = prefix.rfind("\n\n")

    if cut < int(limit * 0.75):
        cut = prefix.rfind("\n")

    if cut < int(limit * 0.75):
        cut = prefix.rfind(". ")
        if cut >= int(limit * 0.75):
            cut += 1

    if cut < int(limit * 0.75):
        cut = limit

    return prefix[:cut].rstrip()


def _cited_source_ids(answer: str) -> list[str]:
    return list(dict.fromkeys(_CITATION_PATTERN.findall(answer)))


class StudyAgent:
    """Answers questions using retrieved material from one course only."""

    def __init__(
        self,
        retriever: CourseRetriever,
        llm_client: AsyncCompletionClient | None = None,
        *,
        retrieval_limit: int = 5,
        max_completion_tokens: int = 1_600,
        course_overview_limit: int = 256,
        course_overview_completion_tokens: int = 3_000,
    ) -> None:
        if retrieval_limit < 1:
            raise ValueError("retrieval_limit must be at least 1.")

        if max_completion_tokens < 1:
            raise ValueError("max_completion_tokens must be at least 1.")

        if course_overview_limit < 1:
            raise ValueError("course_overview_limit must be at least 1.")

        if course_overview_completion_tokens < 1:
            raise ValueError(
                "course_overview_completion_tokens must be at least 1."
            )

        self._retriever = retriever
        self._llm_client = llm_client
        self._retrieval_limit = retrieval_limit
        self._max_completion_tokens = max_completion_tokens
        self._course_overview_limit = course_overview_limit
        self._course_overview_completion_tokens = (
            course_overview_completion_tokens
        )

    async def run(self, request: AgentRequest) -> AgentResult:
        course_wide = _is_course_wide_request(request.message)

        if course_wide:
            chunks = self._retriever.course_overview(
                course_id=request.course_id,
                limit=self._course_overview_limit,
            )
        else:
            chunks = self._retriever.search(
                course_id=request.course_id,
                query=request.message,
                limit=self._retrieval_limit,
            )

        if not chunks:
            return AgentResult(
                agent=AgentName.STUDY,
                content=(
                    "I couldn’t find enough information in this course’s "
                    "materials to answer that yet. Try asking about a topic "
                    "covered in the uploaded lectures, or ask your instructor "
                    "to add the relevant material."
                ),
                sources=[],
                requires_human_review=False,
                metadata={
                    "grounded": False,
                    "retrieved_count": 0,
                    "reason": "no_retrieval_results",
                },
            )

        messages, source_map = build_study_messages(
            request,
            chunks,
            course_wide=course_wide,
        )

        try:
            client = self._llm_client or QuantumBlackLLMClient()
            response = await client.acomplete(
                messages,
                max_completion_tokens=(
                    self._course_overview_completion_tokens
                    if course_wide
                    else self._max_completion_tokens
                ),
            )
            answer = _clip_answer(_unwrap_study_answer(response.text))
        except (
            LLMConfigurationError,
            LLMGatewayError,
            StudyAgentParsingError,
        ):
            return self._review_required_result(
                reason="generation_or_validation_failed",
                retrieved_count=len(chunks),
            )

        # Citations are verified from what the learner will actually see. We do
        # not trust a separate model-provided list of source IDs.
        used_source_ids = _cited_source_ids(answer)
        unknown_source_ids = [
            source_id
            for source_id in used_source_ids
            if source_id not in source_map
        ]

        if not used_source_ids or unknown_source_ids:
            return self._review_required_result(
                reason="unverified_citations",
                retrieved_count=len(chunks),
            )

        sources = [source_map[source_id] for source_id in used_source_ids]

        return AgentResult(
            agent=AgentName.STUDY,
            content=answer,
            sources=sources,
            requires_human_review=False,
            metadata={
                "grounded": True,
                "retrieved_count": len(chunks),
                "used_source_ids": used_source_ids,
                "scope": "course_overview" if course_wide else "focused",
            },
        )

    @staticmethod
    def _review_required_result(
        *,
        reason: str,
        retrieved_count: int,
    ) -> AgentResult:
        return AgentResult(
            agent=AgentName.STUDY,
            content=(
                "I found relevant course material, but I couldn’t create "
                "a fully verified explanation. Your instructor can review "
                "this question."
            ),
            sources=[],
            requires_human_review=True,
            metadata={
                "grounded": False,
                "retrieved_count": retrieved_count,
                "reason": reason,
            },
        )