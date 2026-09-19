import pytest

from app.ai.agents.reviewer import (
    HumanReviewQueue,
    RuleBasedReviewer,
)
from app.ai.schemas.models import (
    AgentName,
    AgentRequest,
    AgentResult,
    QuizGradeResult,
    ReviewAction,
    ReviewQueueStatus,
    SourceReference,
    UserRole,
)


def grounded_study_result() -> AgentResult:
    return AgentResult(
        agent=AgentName.STUDY,
        content="Momentum equals mass times velocity [S1].",
        sources=[
            SourceReference(
                document_id="lecture-2",
                title="Momentum",
                page=4,
                chunk_id="momentum-1",
            )
        ],
        requires_human_review=False,
        metadata={
            "grounded": True,
            "used_source_ids": ["S1"],
        },
    )


def test_publishes_verified_study_result() -> None:
    reviewer = RuleBasedReviewer()

    review = reviewer.review_agent_result(
        grounded_study_result()
    )

    assert review.approved is True
    assert review.action == ReviewAction.PUBLISH
    assert review.issues == []


def test_explicit_review_request_goes_to_teacher() -> None:
    reviewer = RuleBasedReviewer()

    result = grounded_study_result().model_copy(
        update={"requires_human_review": True}
    )

    review = reviewer.review_agent_result(result)

    assert review.approved is False
    assert review.action == ReviewAction.TEACHER_REVIEW


def test_grounded_result_without_sources_is_blocked() -> None:
    reviewer = RuleBasedReviewer()

    result = grounded_study_result().model_copy(
        update={"sources": []}
    )

    review = reviewer.review_agent_result(result)

    assert review.approved is False
    assert any(
        "no verified sources" in issue
        for issue in review.issues
    )


def test_assessment_answer_key_leak_is_blocked() -> None:
    reviewer = RuleBasedReviewer()

    result = AgentResult(
        agent=AgentName.ASSESSMENT,
        content="Quiz created.",
        sources=[
            SourceReference(
                document_id="lecture-2",
                title="Momentum",
                page=4,
                chunk_id="momentum-1",
            )
        ],
        metadata={
            "grounded": True,
            "quiz": {
                "questions": [{"question_id": "q1"}],
                "answer_key": [{"question_id": "q1"}],
            },
        },
    )

    review = reviewer.review_agent_result(result)

    assert review.approved is False
    assert any(
        "answer key" in issue.lower()
        for issue in review.issues
    )


def test_low_confidence_grade_is_blocked() -> None:
    reviewer = RuleBasedReviewer(
        minimum_grade_confidence=0.80
    )

    grade = QuizGradeResult(
        quiz_id="quiz-1",
        correct_count=1,
        total_questions=2,
        score_percent=50,
        question_results=[],
        misconception_tags=[],
        confidence=0.60,
        requires_human_review=False,
    )

    review = reviewer.review_grade(grade)

    assert review.approved is False
    assert review.action == ReviewAction.TEACHER_REVIEW


def test_queue_can_publish_or_revise_items() -> None:
    reviewer = RuleBasedReviewer()
    queue = HumanReviewQueue()

    request = AgentRequest(
        user_id="student-1",
        course_id="physics-101",
        role=UserRole.STUDENT,
        message="Explain momentum.",
    )

    result = grounded_study_result().model_copy(
        update={"requires_human_review": True}
    )

    review = reviewer.review_agent_result(result)

    item = queue.enqueue(
        request=request,
        result=result,
        review=review,
    )

    assert item.status == ReviewQueueStatus.PENDING
    assert queue.get(item.review_id) == item
    assert queue.list_pending(
        course_id="physics-101"
    ) == [item]

    resolved = queue.resolve(
        review_id=item.review_id,
        action=ReviewAction.REVISE,
        revised_content=(
            "Teacher-approved momentum explanation."
        ),
    )

    assert resolved.status == ReviewQueueStatus.REVISED
    assert resolved.final_content == (
        "Teacher-approved momentum explanation."
    )
    assert queue.list_pending(
        course_id="physics-101"
    ) == []

    with pytest.raises(ValueError):
        queue.resolve(
            review_id=item.review_id,
            action=ReviewAction.PUBLISH,
        )


def test_handoff_removes_item_from_sidecar_queue() -> None:
    queue = HumanReviewQueue()
    request = AgentRequest(
        user_id="student-1",
        course_id="physics-101",
        role=UserRole.STUDENT,
        message="Explain momentum.",
    )
    result = grounded_study_result().model_copy(
        update={"requires_human_review": True}
    )
    review = RuleBasedReviewer().review_agent_result(result)
    item = queue.enqueue(request=request, result=result, review=review)

    assert queue.take(item.review_id) == item
    assert queue.list_pending(course_id="physics-101") == []
    with pytest.raises(KeyError):
        queue.get(item.review_id)
