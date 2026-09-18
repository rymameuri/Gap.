import asyncio
import json
from types import SimpleNamespace

import pytest

from app.ai.agents.assessment_agent import (
    AssessmentAgent,
    UnknownQuizError,
)
from app.ai.schemas.models import (
    AgentName,
    AgentRequest,
    QuizSubmission,
    RetrievedChunk,
    SourceReference,
    UserRole,
)


class FakeRetriever:
    def __init__(
        self,
        chunks: list[RetrievedChunk],
    ) -> None:
        self.chunks = chunks

    def search(
        self,
        *,
        course_id: str,
        query: str,
        limit: int = 5,
    ) -> list[RetrievedChunk]:
        return self.chunks[:limit]


class FakeLLMClient:
    def __init__(self, response_text: str) -> None:
        self.response_text = response_text
        self.calls = 0

    async def acomplete(
        self,
        messages,
        *,
        max_completion_tokens: int,
    ):
        self.calls += 1
        return SimpleNamespace(text=self.response_text)


def make_chunk() -> RetrievedChunk:
    return RetrievedChunk(
        text=(
            "Momentum is the product of mass and velocity. "
            "Its equation is p = mv. Momentum is a vector."
        ),
        source=SourceReference(
            document_id="lecture-2",
            title="Lecture 2: Momentum",
            page=4,
            chunk_id="momentum-1",
        ),
        relevance_score=3.0,
    )


def make_request() -> AgentRequest:
    return AgentRequest(
        user_id="student-1",
        course_id="physics-101",
        role=UserRole.STUDENT,
        message="Generate a quiz about momentum.",
    )


def valid_quiz_json() -> str:
    return json.dumps(
        {
            "title": "Momentum Check",
            "questions": [
                {
                    "question_id": "q1",
                    "prompt": "Which equation defines momentum?",
                    "choices": [
                        "p = mv",
                        "p = ma",
                        "p = m/v",
                        "p = v/m",
                    ],
                    "source_ids": ["S1"],
                },
                {
                    "question_id": "q2",
                    "prompt": "Which type of quantity is momentum?",
                    "choices": [
                        "Scalar",
                        "Vector",
                        "Dimensionless",
                        "Constant",
                    ],
                    "source_ids": ["S1"],
                },
            ],
            "answer_key": [
                {
                    "question_id": "q1",
                    "correct_choice_index": 0,
                    "explanation": (
                        "Momentum is defined as p = mv [S1]."
                    ),
                    "misconception_tag": "momentum-formula",
                },
                {
                    "question_id": "q2",
                    "correct_choice_index": 1,
                    "explanation": (
                        "Momentum is a vector quantity [S1]."
                    ),
                    "misconception_tag": "vector-vs-scalar",
                },
            ],
        }
    )


def make_agent(
    response_text: str | None = None,
) -> AssessmentAgent:
    return AssessmentAgent(
        retriever=FakeRetriever([make_chunk()]),
        llm_client=FakeLLMClient(
            response_text or valid_quiz_json()
        ),
        default_question_count=2,
    )


def test_no_sources_returns_safe_result() -> None:
    llm = FakeLLMClient(valid_quiz_json())

    agent = AssessmentAgent(
        retriever=FakeRetriever([]),
        llm_client=llm,
        default_question_count=2,
    )

    result = asyncio.run(agent.run(make_request()))

    assert result.agent == AgentName.ASSESSMENT
    assert result.metadata["grounded"] is False
    assert result.metadata["reason"] == "no_retrieval_results"
    assert result.requires_human_review is False
    assert llm.calls == 0


def test_generates_grounded_quiz_without_exposing_key() -> None:
    agent = make_agent()

    result = asyncio.run(agent.run(make_request()))

    assert result.agent == AgentName.ASSESSMENT
    assert result.metadata["grounded"] is True
    assert result.requires_human_review is False
    assert len(result.sources) == 1

    public_quiz = result.metadata["quiz"]

    assert len(public_quiz["questions"]) == 2
    assert "answer_key" not in public_quiz
    assert result.metadata["quiz_id"]


def test_unknown_source_requires_review() -> None:
    payload = json.loads(valid_quiz_json())
    payload["questions"][0]["source_ids"] = ["S99"]

    agent = make_agent(json.dumps(payload))

    result = asyncio.run(agent.run(make_request()))

    assert result.requires_human_review is True
    assert result.metadata["grounded"] is False
    assert (
        result.metadata["reason"]
        == "generation_or_validation_failed"
    )


def test_grades_quiz_and_emits_misconception_tags() -> None:
    agent = make_agent()

    generated = asyncio.run(agent.run(make_request()))
    quiz_id = generated.metadata["quiz_id"]

    grade = agent.grade_submission(
        QuizSubmission(
            quiz_id=quiz_id,
            answers={
                "q1": 0,
                "q2": 0,
            },
        )
    )

    assert grade.correct_count == 1
    assert grade.total_questions == 2
    assert grade.score_percent == 50.0
    assert grade.confidence == 1.0
    assert grade.requires_human_review is False
    assert grade.misconception_tags == [
        "vector-vs-scalar"
    ]


def test_unknown_quiz_cannot_be_graded() -> None:
    agent = make_agent()

    with pytest.raises(UnknownQuizError):
        agent.grade_submission(
            QuizSubmission(
                quiz_id="missing-quiz",
                answers={},
            )
        )