import asyncio
import json
from types import SimpleNamespace

from app.ai.agents.study_agent import StudyAgent
from app.ai.schemas.models import (
    AgentName,
    AgentRequest,
    ChatMessage,
    RetrievedChunk,
    SourceReference,
    UserRole,
)


class FakeRetriever:
    def __init__(self, chunks: list[RetrievedChunk]) -> None:
        self.chunks = chunks
        self.calls: list[dict[str, object]] = []

    def course_overview(
        self,
        course_id: str,
        limit: int = 256,
    ) -> list[RetrievedChunk]:
        self.calls.append(
            {
                "course_id": course_id,
                "overview": True,
                "limit": limit,
            }
        )
        return self.chunks[:limit]

    def search(
        self,
        *,
        course_id: str,
        query: str,
        limit: int = 5,
    ) -> list[RetrievedChunk]:
        self.calls.append(
            {
                "course_id": course_id,
                "query": query,
                "limit": limit,
            }
        )
        return self.chunks[:limit]


class FakeLLMClient:
    def __init__(self, response_text: str) -> None:
        self.response_text = response_text
        self.calls: list[dict[str, object]] = []

    async def acomplete(
        self,
        messages,
        *,
        max_completion_tokens: int,
    ):
        self.calls.append(
            {
                "messages": list(messages),
                "max_completion_tokens": max_completion_tokens,
            }
        )
        return SimpleNamespace(text=self.response_text)


def make_request() -> AgentRequest:
    return AgentRequest(
        user_id="student-1",
        course_id="physics-101",
        role=UserRole.STUDENT,
        message="Can you explain momentum?",
    )


def make_chunk() -> RetrievedChunk:
    return RetrievedChunk(
        text=(
            "Momentum is the product of an object's mass and velocity. "
            "It is represented by p = mv."
        ),
        source=SourceReference(
            document_id="lecture-2",
            title="Lecture 2: Momentum",
            page=4,
            chunk_id="momentum-chunk-1",
        ),
        relevance_score=2.5,
    )


def test_returns_safe_message_when_no_sources_are_found() -> None:
    retriever = FakeRetriever([])
    llm_client = FakeLLMClient("{}")
    agent = StudyAgent(retriever, llm_client)

    result = asyncio.run(agent.run(make_request()))

    assert result.agent == AgentName.STUDY
    assert result.sources == []
    assert result.requires_human_review is False
    assert result.metadata["grounded"] is False
    assert result.metadata["reason"] == "no_retrieval_results"
    assert llm_client.calls == []


def test_returns_grounded_answer_with_verified_source() -> None:
    chunk = make_chunk()
    retriever = FakeRetriever([chunk])
    llm_client = FakeLLMClient(
        json.dumps(
            {
                "answer": (
                    "Momentum tells you how much motion an object has. "
                    "It equals mass multiplied by velocity: p = mv [S1]."
                ),
                "used_source_ids": ["S1"],
            }
        )
    )
    agent = StudyAgent(retriever, llm_client)

    result = asyncio.run(agent.run(make_request()))

    assert result.content.endswith("[S1].")
    assert result.sources == [chunk.source]
    assert result.requires_human_review is False
    assert result.metadata["grounded"] is True
    assert result.metadata["used_source_ids"] == ["S1"]

    prompt = llm_client.calls[0]["messages"][1]["content"]
    assert "Lecture 2: Momentum" in prompt
    assert "page 4" in prompt


def test_includes_recent_history_as_untrusted_context() -> None:
    llm_client = FakeLLMClient(
        json.dumps(
            {
                "answer": "Momentum equals mass times velocity [S1].",
                "used_source_ids": ["S1"],
            }
        )
    )
    request = make_request().model_copy(
        update={
            "history": [
                ChatMessage(
                    role="user",
                    content="How does mass affect it?",
                )
            ]
        }
    )

    asyncio.run(StudyAgent(FakeRetriever([make_chunk()]), llm_client).run(request))

    messages = llm_client.calls[0]["messages"]
    assert "untrusted context" in messages[0]["content"]
    assert "How does mass affect it?" in messages[1]["content"]


def test_direct_markdown_answer_with_verified_citation_is_published() -> None:
    chunk = make_chunk()
    retriever = FakeRetriever([chunk])
    llm_client = FakeLLMClient(
        "## Momentum\n\nMomentum equals mass times velocity: `p = mv` [S1]."
    )
    agent = StudyAgent(retriever, llm_client)

    result = asyncio.run(agent.run(make_request()))

    assert result.requires_human_review is False
    assert result.content.startswith("## Momentum")
    assert result.sources == [chunk.source]
    assert result.metadata["used_source_ids"] == ["S1"]


def test_invalid_json_requires_human_review() -> None:
    retriever = FakeRetriever([make_chunk()])
    llm_client = FakeLLMClient("This is not valid JSON.")
    agent = StudyAgent(retriever, llm_client)

    result = asyncio.run(agent.run(make_request()))

    assert result.requires_human_review is True
    assert result.sources == []
    assert result.metadata["reason"] == "unverified_citations"


def test_unknown_source_id_requires_human_review() -> None:
    retriever = FakeRetriever([make_chunk()])
    llm_client = FakeLLMClient(
        json.dumps(
            {
                "answer": "Momentum is mass multiplied by velocity [S9].",
                "used_source_ids": ["S9"],
            }
        )
    )
    agent = StudyAgent(retriever, llm_client)

    result = asyncio.run(agent.run(make_request()))

    assert result.requires_human_review is True
    assert result.sources == []
    assert result.metadata["reason"] == "unverified_citations"


def test_missing_inline_citation_requires_human_review() -> None:
    retriever = FakeRetriever([make_chunk()])
    llm_client = FakeLLMClient(
        json.dumps(
            {
                "answer": "Momentum is mass multiplied by velocity.",
                "used_source_ids": ["S1"],
            }
        )
    )
    agent = StudyAgent(retriever, llm_client)

    result = asyncio.run(agent.run(make_request()))

    assert result.requires_human_review is True
    assert result.sources == []
    assert result.metadata["reason"] == "unverified_citations"


def test_full_course_request_uses_course_wide_context_and_larger_budget() -> None:
    first = make_chunk()
    second = RetrievedChunk(
        text="Energy is conserved in an isolated system.",
        source=SourceReference(
            document_id="lecture-3",
            title="Lecture 3: Energy",
            page=7,
            chunk_id="energy-chunk-1",
        ),
    )
    retriever = FakeRetriever([first, second])
    llm_client = FakeLLMClient(
        json.dumps(
            {
                "answer": (
                    "## Course overview\n\n"
                    "- Momentum connects mass and velocity [S1].\n"
                    "- Energy is conserved in an isolated system [S2]."
                ),
                "used_source_ids": ["S1", "S2"],
            }
        )
    )
    request = make_request().model_copy(
        update={"message": "Explain the full course from beginning to end."}
    )

    result = asyncio.run(StudyAgent(retriever, llm_client).run(request))

    assert retriever.calls == [
        {"course_id": "physics-101", "overview": True, "limit": 256}
    ]
    assert result.metadata["scope"] == "course_overview"
    assert result.sources == [first.source, second.source]
    assert llm_client.calls[0]["max_completion_tokens"] == 3_000
    prompt = llm_client.calls[0]["messages"][1]["content"]
    assert "Response scope: course-wide" in prompt
    assert "Lecture 3: Energy" in prompt


def test_long_markdown_answer_is_clipped_below_history_limit() -> None:
    chunk = make_chunk()
    retriever = FakeRetriever([chunk])
    llm_client = FakeLLMClient(("Long grounded explanation [S1].\n\n" * 800))
    agent = StudyAgent(retriever, llm_client)

    result = asyncio.run(agent.run(make_request()))

    assert result.requires_human_review is False
    assert len(result.content) <= 15_000
    assert "[S1]" in result.content
