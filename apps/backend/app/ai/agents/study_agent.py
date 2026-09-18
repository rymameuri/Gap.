import json
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
    def search(
        self,
        *,
        course_id: str,
        query: str,
        limit: int = 5,
    ) -> list[RetrievedChunk]:
        ...


class StudyAgentParsingError(ValueError):
    """Raised when the Study Agent returns invalid structured output."""


def _parse_study_output(text: str) -> StudyAgentOutput:
    """Extract and validate the JSON object returned by the model."""

    start = text.find("{")
    end = text.rfind("}")

    if start == -1 or end == -1 or end < start:
        raise StudyAgentParsingError(
            "The Study Agent response did not contain a JSON object."
        )

    json_text = text[start : end + 1]

    try:
        payload = json.loads(json_text)
    except json.JSONDecodeError as exc:
        raise StudyAgentParsingError(
            "The Study Agent returned invalid JSON."
        ) from exc

    try:
        return StudyAgentOutput.model_validate(payload)
    except ValidationError as exc:
        raise StudyAgentParsingError(
            "The Study Agent response did not match the required schema."
        ) from exc


class StudyAgent:
    """Answers questions using retrieved material from one course only."""

    def __init__(
        self,
        retriever: CourseRetriever,
        llm_client: AsyncCompletionClient | None = None,
        *,
        retrieval_limit: int = 5,
        max_completion_tokens: int = 1_000,
    ) -> None:
        if retrieval_limit < 1:
            raise ValueError("retrieval_limit must be at least 1.")

        if max_completion_tokens < 1:
            raise ValueError("max_completion_tokens must be at least 1.")

        self._retriever = retriever
        self._llm_client = llm_client
        self._retrieval_limit = retrieval_limit
        self._max_completion_tokens = max_completion_tokens

    async def run(self, request: AgentRequest) -> AgentResult:
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

        messages, source_map = build_study_messages(request, chunks)

        try:
            client = self._llm_client or QuantumBlackLLMClient()
            response = await client.acomplete(
                messages,
                max_completion_tokens=self._max_completion_tokens,
            )
            output = _parse_study_output(response.text)
        except (
            LLMConfigurationError,
            LLMGatewayError,
            StudyAgentParsingError,
        ):
            return self._review_required_result(
                reason="generation_or_validation_failed",
                retrieved_count=len(chunks),
            )

        used_source_ids = list(dict.fromkeys(output.used_source_ids))

        unknown_source_ids = [
            source_id
            for source_id in used_source_ids
            if source_id not in source_map
        ]

        missing_inline_citations = [
            source_id
            for source_id in used_source_ids
            if f"[{source_id}]" not in output.answer
        ]

        if (
            not used_source_ids
            or unknown_source_ids
            or missing_inline_citations
        ):
            return self._review_required_result(
                reason="unverified_citations",
                retrieved_count=len(chunks),
            )

        sources = [
            source_map[source_id]
            for source_id in used_source_ids
        ]

        return AgentResult(
            agent=AgentName.STUDY,
            content=output.answer,
            sources=sources,
            requires_human_review=False,
            metadata={
                "grounded": True,
                "retrieved_count": len(chunks),
                "used_source_ids": used_source_ids,
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