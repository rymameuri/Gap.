import asyncio
import json
from types import SimpleNamespace

from app.ai.rag.retriever import InMemoryCourseRetriever
from app.ai.schemas.models import (
    AgentName,
    AgentRequest,
    GapStatus,
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


async def diagnostic_router(
    request: AgentRequest,
) -> RouteDecision:
    return RouteDecision(
        intent=Intent.DIAGNOSE_GAPS,
        target_agent=AgentName.DIAGNOSTIC,
        matched_phrases=["learning gaps"],
        secondary_intents=[],
        requires_clarification=False,
        denied=False,
        reason="Diagnostic integration test.",
    )


def test_grade_updates_and_closes_diagnostic_loop() -> None:
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
        router=diagnostic_router,
        default_quiz_question_count=1,
    )

    generated = asyncio.run(
        service.generate_quiz(
            course_id="physics-101",
            topic="momentum",
            question_count=1,
        )
    )

    assert generated.requires_human_review is False

    quiz_id = generated.metadata["quiz_id"]

    # The student initially selects the wrong answer.
    initial_grade = service.grade_quiz_submission(
        course_id="physics-101",
        student_id="student-1",
        submission=QuizSubmission(
            quiz_id=quiz_id,
            answers={"q1": 1},
        ),
    )

    assert initial_grade.score_percent == 0
    assert initial_grade.misconception_tags == [
        "momentum-formula"
    ]

    initial_report = service.course_diagnostic_report(
        "physics-101"
    )

    assert initial_report.total_students == 1
    assert initial_report.total_attempts == 1
    assert len(initial_report.gap_clusters) == 1
    assert (
        initial_report.gap_clusters[0].tag
        == "momentum-formula"
    )
    assert (
        initial_report.gap_clusters[0].status
        == GapStatus.OPEN
    )
    assert (
        initial_report.gap_clusters[0]
        .affected_student_count
        == 1
    )

    # The student answers the follow-up correctly.
    follow_up_grade = service.grade_quiz_submission(
        course_id="physics-101",
        student_id="student-1",
        submission=QuizSubmission(
            quiz_id=quiz_id,
            answers={"q1": 0},
        ),
        is_follow_up=True,
        targeted_tags=["momentum-formula"],
    )

    assert follow_up_grade.score_percent == 100
    assert follow_up_grade.misconception_tags == []

    updated_report = service.course_diagnostic_report(
        "physics-101"
    )

    assert updated_report.total_attempts == 2
    assert (
        updated_report.gap_clusters[0].status
        == GapStatus.RESOLVED
    )
    assert (
        updated_report.gap_clusters[0]
        .affected_student_count
        == 0
    )
    assert (
        updated_report.gap_clusters[0]
        .resolved_students
        == ["student-1"]
    )

    # Confirm the orchestrator can dispatch to DiagnosticAgent.
    teacher_request = AgentRequest(
        user_id="teacher-1",
        course_id="physics-101",
        role=UserRole.TEACHER,
        message="Show the class learning gaps.",
    )

    workflow_response = asyncio.run(
        service.run(teacher_request)
    )

    assert (
        workflow_response.route.target_agent
        == AgentName.DIAGNOSTIC
    )
    assert (
        workflow_response.result.agent
        == AgentName.DIAGNOSTIC
    )
    assert (
        workflow_response.result.metadata["report"]
        ["gap_clusters"][0]["status"]
        == "resolved"
    )

    # Quiz creation used one LLM call. Grading, diagnostics,
    # follow-up verification, and reporting used none.
    assert llm_client.calls == 1