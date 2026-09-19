import json
import re
from collections.abc import Awaitable, Callable, Mapping, Sequence
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
    SourceReference,
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


def _take_complete_markdown_blocks(buffer: str) -> tuple[list[str], str]:
    """Drain blank-line-delimited Markdown blocks outside fenced code."""

    blocks: list[str] = []
    search_from = 0

    while True:
        boundary = buffer.find("\n\n", search_from)
        if boundary == -1:
            break

        candidate = buffer[: boundary + 2]

        # Keep fenced code together; blank lines inside it are not block ends.
        if candidate.count("```") % 2:
            search_from = boundary + 2
            continue

        blocks.append(candidate)
        buffer = buffer[boundary + 2 :]
        search_from = 0

    return blocks, buffer


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

    def _retrieve(self, request: AgentRequest) -> tuple[bool, list[RetrievedChunk]]:
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

        return course_wide, chunks

    def _completion_budget(self, course_wide: bool) -> int:
        return (
            self._course_overview_completion_tokens
            if course_wide
            else self._max_completion_tokens
        )

    @staticmethod
    def _no_sources_result() -> AgentResult:
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

    def _grounded_result(
        self,
        *,
        answer: str,
        source_map: Mapping[str, SourceReference],
        retrieved_count: int,
        course_wide: bool,
    ) -> AgentResult:
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
                retrieved_count=retrieved_count,
            )

        sources = [source_map[source_id] for source_id in used_source_ids]

        return AgentResult(
            agent=AgentName.STUDY,
            content=answer,
            sources=sources,
            requires_human_review=False,
            metadata={
                "grounded": True,
                "retrieved_count": retrieved_count,
                "used_source_ids": used_source_ids,
                "scope": "course_overview" if course_wide else "focused",
            },
        )

    async def run(self, request: AgentRequest) -> AgentResult:
        course_wide, chunks = self._retrieve(request)

        if not chunks:
            return self._no_sources_result()

        messages, source_map = build_study_messages(
            request,
            chunks,
            course_wide=course_wide,
        )

        try:
            client = self._llm_client or QuantumBlackLLMClient()
            response = await client.acomplete(
                messages,
                max_completion_tokens=self._completion_budget(course_wide),
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

        return self._grounded_result(
            answer=answer,
            source_map=source_map,
            retrieved_count=len(chunks),
            course_wide=course_wide,
        )

    async def run_streaming(
        self,
        request: AgentRequest,
        on_delta: Callable[[str], Awaitable[None]],
    ) -> AgentResult:
        """Stream citation-checked Markdown blocks, then return the final result."""

        course_wide, chunks = self._retrieve(request)

        if not chunks:
            return self._no_sources_result()

        messages, source_map = build_study_messages(
            request,
            chunks,
            course_wide=course_wide,
        )
        try:
            client = self._llm_client or QuantumBlackLLMClient()
        except LLMConfigurationError:
            return self._review_required_result(
                reason="generation_or_validation_failed",
                retrieved_count=len(chunks),
            )

        stream = getattr(client, "astream", None)

        # Test doubles and older compatible clients can still use the existing
        # complete-response path. The browser endpoint remains functional.
        if not callable(stream):
            return await self.run(request)

        raw_answer = ""
        stream_buffer = ""
        pending_blocks = ""
        published = ""
        streamable: bool | None = None
        invalid_stream_citation = False

        try:
            async for delta in stream(
                messages,
                max_completion_tokens=self._completion_budget(course_wide),
            ):
                raw_answer += delta
                stream_buffer += delta

                if streamable is None:
                    stripped = raw_answer.lstrip()

                    if not stripped:
                        continue

                    # Legacy JSON and whole-answer code fences are validated at
                    # completion rather than exposed progressively.
                    if stripped.startswith("{") or stripped.startswith("```"):
                        streamable = False
                    elif "```".startswith(stripped) and len(stripped) < 3:
                        continue
                    else:
                        streamable = True

                if not streamable:
                    continue

                blocks, stream_buffer = _take_complete_markdown_blocks(
                    stream_buffer
                )

                for block in blocks:
                    pending_blocks += block
                    cited = _cited_source_ids(pending_blocks)
                    unknown = [
                        source_id
                        for source_id in cited
                        if source_id not in source_map
                    ]

                    if unknown:
                        invalid_stream_citation = True
                        break

                    # Headings are commonly uncited. Hold them until the next
                    # cited paragraph/list so no unverified block is exposed.
                    if cited:
                        if (
                            len(published) + len(pending_blocks)
                            <= _MAX_PUBLISHED_ANSWER_CHARS
                        ):
                            await on_delta(pending_blocks)
                            published += pending_blocks
                        pending_blocks = ""

                if invalid_stream_citation:
                    break
        except LLMGatewayError:
            # If the provider does not support streaming, preserve the existing
            # complete-response behavior. Never retry after content was shown.
            if not published:
                return await self.run(request)
            return self._review_required_result(
                reason="generation_or_validation_failed",
                retrieved_count=len(chunks),
            )

        if invalid_stream_citation:
            return self._review_required_result(
                reason="unverified_citations",
                retrieved_count=len(chunks),
            )

        try:
            answer = _clip_answer(_unwrap_study_answer(raw_answer))
        except StudyAgentParsingError:
            return self._review_required_result(
                reason="generation_or_validation_failed",
                retrieved_count=len(chunks),
            )

        result = self._grounded_result(
            answer=answer,
            source_map=source_map,
            retrieved_count=len(chunks),
            course_wide=course_wide,
        )

        if result.requires_human_review:
            return result

        # Flush a verified trailing block (or the whole answer for legacy
        # non-progressive output) only after the complete answer passes the
        # same citation validation used by the non-streaming path.
        if answer.startswith(published):
            tail = answer[len(published) :]
            if tail:
                await on_delta(tail)

        return result

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
