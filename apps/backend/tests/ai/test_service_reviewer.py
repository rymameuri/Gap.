import asyncio
import json
from types import SimpleNamespace

from app.ai.rag.retriever import InMemoryCourseRetriever
from app.ai.schemas.models import (
    AgentName,
    AgentRequest,
    Intent,
    RetrievedChunk,
    ReviewAction,
    ReviewQueueStatus,
    RouteDecision,
    SourceReference,
    UserRole,
)
from app.ai.service import AIService


class InvalidAssessmentLLM:
    async def acomplete(
        self,
        messages,
        *,
        max_completion_tokens: int,
    ):
        return SimpleNamespace(
            text=json.dumps(
                {
                    "title": "Invalid Quiz",
                    "questions": [
                        {
                            "question_id": "q1",
                            "prompt": "Invalid source question?",
                            "choices": ["A", "B", "C", "D"],
                            "source_ids": ["S99"],
                        }
                    ],
                    "answer_key": [
                        {
                            "question_id": "q1",
                            "correct_choice_index": 0,
                            "explanation": "Unsupported [S99].",
                            "misconception_tag": "invalid-source",
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
        reason="Reviewer integration test.",
    )


def test_blocked_output_enters_teacher_queue() -> None:
    retriever = InMemoryCourseRetriever()

    retriever.replace_course(
        "physics-101",
        [
            RetrievedChunk(
                text="Momentum is defined as p = mv.",
                source=SourceReference(
                    document_id="lecture-2",
                    title="Momentum",
                    page=4,
                    chunk_id="momentum-1",
                ),
                relevance_score=2.0,
            )
        ],
    )

    service = AIService(
        retriever=retriever,
        llm_client=InvalidAssessmentLLM(),
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

    assert response.result.agent == AgentName.ASSESSMENT
    assert response.result.requires_human_review is True
    assert response.result.sources == []
    assert response.result.metadata["review_approved"] is False
    assert "quiz" not in response.result.metadata

    review_id = response.result.metadata["review_id"]

    pending = service.pending_reviews(
        course_id="physics-101"
    )

    assert len(pending) == 1
    assert pending[0].review_id == review_id
    assert pending[0].status == ReviewQueueStatus.PENDING

    resolved = service.resolve_review(
        review_id=review_id,
        action=ReviewAction.REVISE,
        revised_content="Teacher-approved replacement.",
    )

    assert resolved.status == ReviewQueueStatus.REVISED
    assert resolved.final_content == (
        "Teacher-approved replacement."
    )
    assert service.pending_reviews(
        course_id="physics-101"
    ) == []