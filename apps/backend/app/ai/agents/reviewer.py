from uuid import uuid4

from app.ai.schemas.models import (
    AgentName,
    AgentRequest,
    AgentResult,
    HumanReviewItem,
    QuizGradeResult,
    ReviewAction,
    ReviewQueueStatus,
    ReviewResult,
)


class RuleBasedReviewer:
    """
    Deterministic safety and quality gate.

    The reviewer does not call an LLM. It verifies structural
    requirements and routes uncertain output to a teacher.
    """

    def __init__(
        self,
        *,
        minimum_grade_confidence: float = 0.80,
    ) -> None:
        if not 0 <= minimum_grade_confidence <= 1:
            raise ValueError(
                "minimum_grade_confidence must be "
                "between 0 and 1."
            )

        self._minimum_grade_confidence = (
            minimum_grade_confidence
        )

    def review_agent_result(
        self,
        result: AgentResult,
    ) -> ReviewResult:
        issues: list[str] = []

        if result.requires_human_review:
            issues.append(
                "The producing agent explicitly requested "
                "human review."
            )

        if not result.content.strip():
            issues.append(
                "The response content is empty."
            )

        grounded = result.metadata.get("grounded")

        if grounded is True and not result.sources:
            issues.append(
                "The response is marked as grounded but "
                "contains no verified sources."
            )

        if result.agent == AgentName.STUDY:
            self._review_study_result(
                result=result,
                issues=issues,
            )

        elif result.agent == AgentName.ASSESSMENT:
            self._review_assessment_result(
                result=result,
                issues=issues,
            )

        elif result.agent == AgentName.DIAGNOSTIC:
            self._review_diagnostic_result(
                result=result,
                issues=issues,
            )

        if issues:
            return ReviewResult(
                action=ReviewAction.TEACHER_REVIEW,
                approved=False,
                issues=list(dict.fromkeys(issues)),
                revised_content=None,
            )

        return ReviewResult(
            action=ReviewAction.PUBLISH,
            approved=True,
            issues=[],
            revised_content=None,
        )

    def review_grade(
        self,
        grade: QuizGradeResult,
    ) -> ReviewResult:
        issues: list[str] = []

        if grade.requires_human_review:
            issues.append(
                "The grade explicitly requires human review."
            )

        if grade.confidence < self._minimum_grade_confidence:
            issues.append(
                "The grading confidence is below the "
                f"{self._minimum_grade_confidence:.2f} "
                "publication threshold."
            )

        if issues:
            return ReviewResult(
                action=ReviewAction.TEACHER_REVIEW,
                approved=False,
                issues=issues,
                revised_content=None,
            )

        return ReviewResult(
            action=ReviewAction.PUBLISH,
            approved=True,
            issues=[],
            revised_content=None,
        )

    @staticmethod
    def _review_study_result(
        *,
        result: AgentResult,
        issues: list[str],
    ) -> None:
        if result.metadata.get("grounded") is True:
            if not result.metadata.get("used_source_ids"):
                issues.append(
                    "The grounded study response does not "
                    "identify its used sources."
                )

    @staticmethod
    def _review_assessment_result(
        *,
        result: AgentResult,
        issues: list[str],
    ) -> None:
        if result.metadata.get("grounded") is not True:
            return

        quiz = result.metadata.get("quiz")

        if not isinstance(quiz, dict):
            issues.append(
                "The grounded assessment result does not "
                "contain a structured public quiz."
            )
            return

        if "answer_key" in quiz:
            issues.append(
                "Security check failed: the public quiz "
                "contains an answer key."
            )

        questions = quiz.get("questions")

        if not isinstance(questions, list) or not questions:
            issues.append(
                "The public quiz contains no questions."
            )

    @staticmethod
    def _review_diagnostic_result(
        *,
        result: AgentResult,
        issues: list[str],
    ) -> None:
        if result.metadata.get("deterministic") is not True:
            issues.append(
                "The diagnostic result is not marked as "
                "deterministically calculated."
            )

        has_report = "report" in result.metadata
        has_student_report = (
            "student_report" in result.metadata
        )

        if not has_report and not has_student_report:
            issues.append(
                "The diagnostic result contains no report."
            )


class HumanReviewQueue:
    """In-memory queue for teacher review during the demo."""

    def __init__(self) -> None:
        self._items: dict[str, HumanReviewItem] = {}

    def enqueue(
        self,
        *,
        request: AgentRequest,
        result: AgentResult,
        review: ReviewResult,
    ) -> HumanReviewItem:
        if review.approved:
            raise ValueError(
                "Approved results must not enter the "
                "human-review queue."
            )

        review_id = uuid4().hex

        item = HumanReviewItem(
            review_id=review_id,
            course_id=request.course_id,
            user_id=request.user_id,
            result=result,
            issues=review.issues,
            status=ReviewQueueStatus.PENDING,
            final_content=None,
        )

        self._items[review_id] = item
        return item

    def get(self, review_id: str) -> HumanReviewItem:
        try:
            return self._items[review_id]
        except KeyError as exc:
            raise KeyError(
                f"Unknown review ID: {review_id}"
            ) from exc

    def take(self, review_id: str) -> HumanReviewItem:
        """Transfer a pending item to the durable backend queue."""

        item = self.get(review_id)
        if item.status != ReviewQueueStatus.PENDING:
            raise ValueError("Only pending items can be transferred.")
        del self._items[review_id]
        return item

    def list_pending(
        self,
        *,
        course_id: str | None = None,
    ) -> list[HumanReviewItem]:
        normalized_course_id = (
            course_id.strip()
            if course_id is not None
            else None
        )

        return [
            item
            for item in self._items.values()
            if item.status == ReviewQueueStatus.PENDING
            and (
                normalized_course_id is None
                or item.course_id == normalized_course_id
            )
        ]

    def resolve(
        self,
        *,
        review_id: str,
        action: ReviewAction,
        revised_content: str | None = None,
    ) -> HumanReviewItem:
        item = self.get(review_id)

        if item.status != ReviewQueueStatus.PENDING:
            raise ValueError(
                "This review item has already been resolved."
            )

        if action == ReviewAction.TEACHER_REVIEW:
            raise ValueError(
                "A teacher must publish or revise the item."
            )

        if action == ReviewAction.REVISE:
            if (
                revised_content is None
                or not revised_content.strip()
            ):
                raise ValueError(
                    "Revised content is required when the "
                    "action is revise."
                )

            status = ReviewQueueStatus.REVISED
            final_content = revised_content.strip()
        else:
            status = ReviewQueueStatus.PUBLISHED
            final_content = item.result.content

        resolved_item = item.model_copy(
            update={
                "status": status,
                "final_content": final_content,
            }
        )

        self._items[review_id] = resolved_item
        return resolved_item
