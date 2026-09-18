import asyncio
import json
from types import SimpleNamespace

from app.ai.rag.retriever import InMemoryCourseRetriever
from app.ai.schemas.models import (
    AgentName,
    AgentRequest,
    Intent,
    QuizSubmission,
    RetrievedChunk,
    RouteDecision,
    SourceReference,
    UserRole,
)
from app.ai.service import AIService


class FakeAssessmentLLM:
    def __init__(self) -> None:
        self.calls = 0

    async def acomplete(
        self,
        messages,
        *,
        max_completion_tokens: int,
    ):
        self.calls += 1

        return SimpleNamespace(
            text=json.dumps(
                {
                    "title": "Momentum Check",
                    "questions": [
                        {
                            "question_id": "q1",
                            "prompt": (
                                "Which equation defines momentum?"
                            ),
                            "choices": [
                                "p = mv",
                                "p = ma",
                                "p = m/v",
                                "p = v/m",
                            ],
                            "source_ids": ["S1"],
                        }
                    ],
                    "answer_key": [
                        {
                            "question_id": "q1",
                            "correct_choice_index": 0,
                            "explanation": (
                                "Momentum is defined by "
                                "p = mv [S1]."
                            ),
                            "misconception_tag": (
                                "momentum-formula"
                            ),
                        }
                    ],
                }
            )
        )


async def assessment_router(
    request: AgentRequest,
) -> RouteDecision:
    return RouteDecision(
        intent=Intent.GENERATE_QUIZ,
        target_agent=AgentName.ASSESSMENT,
        matched_phrases=["quiz"],
        secondary_intents=[],
        requires_clarification=False,
        denied=False,
        reason="Assessment service integration test.",
    )


def test_service_routes_generates_and_grades_quiz() -> None:
    retriever = InMemoryCourseRetriever()

    retriever.replace_course(
        "physics-101",
        [
            RetrievedChunk(
                text=(
                    "Momentum is the product of mass and "
                    "velocity. Its equation is p = mv."
                ),
                source=SourceReference(
                    document_id="lecture-2",
                    title="Lecture 2: Momentum",
                    page=4,
                    chunk_id="momentum-1",
                ),
                relevance_score=3.0,
            )
        ],
    )

    llm_client = FakeAssessmentLLM()

    service = AIService(
        retriever=retriever,
        llm_client=llm_client,
        router=assessment_router,
        default_quiz_question_count=1,
    )

    request = AgentRequest(
        user_id="student-1",
        course_id="physics-101",
        role=UserRole.STUDENT,
        message="Generate a quiz about momentum.",
    )

    response = asyncio.run(service.run(request))

    assert response.route.target_agent == AgentName.ASSESSMENT
    assert response.result.agent == AgentName.ASSESSMENT
    assert response.result.metadata["grounded"] is True
    assert response.result.requires_human_review is False
    assert llm_client.calls == 1

    public_quiz = response.result.metadata["quiz"]
    quiz_id = response.result.metadata["quiz_id"]

    assert len(public_quiz["questions"]) == 1
    assert "answer_key" not in public_quiz

    grade = service.grade_quiz_submission(
        course_id="physics-101",
        student_id="student-1",
        submission=QuizSubmission(
            quiz_id=quiz_id,
            answers={"q1": 0},
        ),
    )

    assert grade.correct_count == 1
    assert grade.total_questions == 1
    assert grade.score_percent == 100.0
    assert grade.confidence == 1.0
    assert grade.requires_human_review is False

    # Deterministic grading must not make another LLM call.
    assert llm_client.calls == 1