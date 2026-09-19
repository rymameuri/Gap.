from collections.abc import Awaitable, Callable, Sequence

from app.ai.agents.assessment_agent import AssessmentAgent
from app.ai.agents.diagnostic_agent import DiagnosticAgent
from app.ai.agents.reviewer import (
    HumanReviewQueue,
    RuleBasedReviewer,
)
from app.ai.agents.study_agent import (
    AsyncCompletionClient,
    StudyAgent,
)
from app.ai.orchestration.workflow import (
    AgentWorkflow,
    AsyncRouter,
)
from app.ai.rag.chunker import chunk_sections
from app.ai.rag.loaders import load_document
from app.ai.rag.retriever import InMemoryCourseRetriever
from app.ai.schemas.models import (
    AgentName,
    AgentRequest,
    AgentResult,
    CourseDiagnosticReport,
    CourseDocumentInput,
    CourseIndexResult,
    DocumentFormat,
    DocumentSection,
    HumanReviewItem,
    QuizDifficulty,
    QuizGradeResult,
    QuizSubmission,
    ReviewAction,
    ReviewResult,
    UserRole,
    WorkflowResponse,
)


class AIService:
    """
    Backend-callable interface for Manara's AI system.

    Create one AIService instance for the application. Creating a new
    instance for each request would erase the in-memory course index,
    generated quiz keys, diagnostics, and review queue.
    """

    def __init__(
        self,
        *,
        retriever: InMemoryCourseRetriever | None = None,
        llm_client: AsyncCompletionClient | None = None,
        router: AsyncRouter | None = None,
        chunk_size_words: int = 180,
        overlap_words: int = 30,
        retrieval_limit: int = 5,
        default_quiz_question_count: int = 5,
        default_quiz_difficulty: QuizDifficulty = (
            QuizDifficulty.MEDIUM
        ),
        minimum_grade_confidence: float = 0.80,
    ) -> None:
        if chunk_size_words < 1:
            raise ValueError(
                "chunk_size_words must be at least 1."
            )

        if overlap_words < 0:
            raise ValueError(
                "overlap_words cannot be negative."
            )

        if overlap_words >= chunk_size_words:
            raise ValueError(
                "overlap_words must be smaller than "
                "chunk_size_words."
            )

        if retrieval_limit < 1:
            raise ValueError(
                "retrieval_limit must be at least 1."
            )

        if not 1 <= default_quiz_question_count <= 10:
            raise ValueError(
                "default_quiz_question_count must be "
                "between 1 and 10."
            )

        self._retriever = (
            retriever
            if retriever is not None
            else InMemoryCourseRetriever()
        )

        self._chunk_size_words = chunk_size_words
        self._overlap_words = overlap_words

        self._study_agent = StudyAgent(
            retriever=self._retriever,
            llm_client=llm_client,
            retrieval_limit=retrieval_limit,
        )

        self._assessment_agent = AssessmentAgent(
            retriever=self._retriever,
            llm_client=llm_client,
            retrieval_limit=retrieval_limit,
            default_question_count=(
                default_quiz_question_count
            ),
            default_difficulty=default_quiz_difficulty,
        )

        self._diagnostic_agent = DiagnosticAgent()

        self._reviewer = RuleBasedReviewer(
            minimum_grade_confidence=(
                minimum_grade_confidence
            )
        )
        self._review_queue = HumanReviewQueue()

        self._workflow = AgentWorkflow(
            agents={
                AgentName.STUDY: self._study_agent,
                AgentName.ASSESSMENT: (
                    self._assessment_agent
                ),
                AgentName.DIAGNOSTIC: (
                    self._diagnostic_agent
                ),
            },
            router=router,
        )

    def replace_course_documents(
        self,
        course_id: str,
        documents: Sequence[CourseDocumentInput],
    ) -> CourseIndexResult:
        """
        Atomically replace one course's in-memory document index.

        The previous index is preserved if loading or chunking fails.
        """

        normalized_course_id = course_id.strip()

        if not normalized_course_id:
            raise ValueError("course_id cannot be empty.")

        document_list = list(documents)

        if not document_list:
            raise ValueError(
                "At least one course document is required."
            )

        document_ids = [
            document.document_id.strip()
            for document in document_list
        ]

        if any(not document_id for document_id in document_ids):
            raise ValueError(
                "document_id cannot be empty or whitespace."
            )

        if len(document_ids) != len(set(document_ids)):
            raise ValueError(
                "Document IDs must be unique within a course."
            )

        if any(
            not document.file_path.strip()
            for document in document_list
        ):
            raise ValueError(
                "file_path cannot be empty or whitespace."
            )

        all_sections = []

        for document, document_id in zip(
            document_list,
            document_ids,
            strict=True,
        ):
            sections = load_document(
                file_path=document.file_path.strip(),
                document_id=document_id,
            )
            all_sections.extend(sections)

        chunks = chunk_sections(
            sections=all_sections,
            chunk_size_words=self._chunk_size_words,
            overlap_words=self._overlap_words,
        )

        if not chunks:
            raise ValueError(
                "The course documents produced no searchable "
                "chunks."
            )

        self._retriever.replace_course(
            normalized_course_id,
            chunks,
        )

        return CourseIndexResult(
            course_id=normalized_course_id,
            document_ids=document_ids,
            document_count=len(document_list),
            section_count=len(all_sections),
            chunk_count=len(chunks),
        )

    def replace_course_text(
        self,
        *,
        course_id: str,
        document_id: str,
        title: str,
        text: str,
    ) -> CourseIndexResult:
        """Atomically index trusted plain-text course material."""

        normalized_course_id = course_id.strip()
        normalized_document_id = document_id.strip()
        normalized_title = title.strip()
        normalized_text = text.strip()

        if not normalized_course_id:
            raise ValueError("course_id cannot be empty.")

        if not normalized_document_id:
            raise ValueError("document_id cannot be empty.")

        if not normalized_title:
            raise ValueError("title cannot be empty.")

        if not normalized_text:
            raise ValueError("text cannot be empty.")

        sections = [
            DocumentSection(
                document_id=normalized_document_id,
                title=normalized_title,
                format=DocumentFormat.TEXT,
                section_index=1,
                text=normalized_text,
            )
        ]
        chunks = chunk_sections(
            sections=sections,
            chunk_size_words=self._chunk_size_words,
            overlap_words=self._overlap_words,
        )

        if not chunks:
            raise ValueError(
                "The course text produced no searchable chunks."
            )

        self._retriever.replace_course(
            normalized_course_id,
            chunks,
        )

        return CourseIndexResult(
            course_id=normalized_course_id,
            document_ids=[normalized_document_id],
            document_count=1,
            section_count=1,
            chunk_count=len(chunks),
        )

    async def run(
        self,
        request: AgentRequest,
    ) -> WorkflowResponse:
        """Route, execute, review, and safely gate one request."""

        response = await self._workflow.run(request)

        review = self._reviewer.review_agent_result(
            response.result
        )

        reviewed_result = self._apply_review_gate(
            request=request,
            result=response.result,
            review=review,
        )

        return response.model_copy(
            update={"result": reviewed_result}
        )

    async def stream_study(
        self,
        request: AgentRequest,
        on_delta: Callable[[str], Awaitable[None]],
    ) -> AgentResult:
        """Stream verified Study Agent blocks while preserving the review gate."""

        route = await self._workflow.route(request)

        # Non-study requests keep the existing workflow semantics. They simply
        # return as one final event rather than being forced through StudyAgent.
        if (
            route.denied
            or route.requires_clarification
            or route.target_agent != AgentName.STUDY
        ):
            return (await self.run(request)).result

        try:
            result = await self._study_agent.run_streaming(
                request,
                on_delta,
            )
        except Exception:
            result = AgentResult(
                agent=AgentName.STUDY,
                content=(
                    "I couldn’t complete that request safely. "
                    "It has been marked for review."
                ),
                sources=[],
                requires_human_review=True,
                metadata={
                    "grounded": False,
                    "workflow_status": "stream_execution_failed",
                },
            )

        review = self._reviewer.review_agent_result(result)

        return self._apply_review_gate(
            request=request,
            result=result,
            review=review,
        )

    async def generate_quiz(
        self,
        *,
        course_id: str,
        topic: str,
        question_count: int = 5,
        difficulty: QuizDifficulty = QuizDifficulty.MEDIUM,
        requested_by: str = "system",
        requester_role: UserRole = UserRole.TEACHER,
    ) -> AgentResult:
        """Generate and review a grounded quiz."""

        result = await self._assessment_agent.generate_quiz(
            course_id=course_id,
            topic=topic,
            question_count=question_count,
            difficulty=difficulty,
        )

        request = AgentRequest(
            user_id=requested_by,
            course_id=course_id,
            role=requester_role,
            message=f"Generate a quiz about {topic}.",
        )

        review = self._reviewer.review_agent_result(result)

        return self._apply_review_gate(
            request=request,
            result=result,
            review=review,
        )

    def grade_quiz_submission(
        self,
        *,
        course_id: str,
        student_id: str,
        submission: QuizSubmission,
        is_follow_up: bool = False,
        targeted_tags: Sequence[str] = (),
    ) -> QuizGradeResult:
        """
        Grade, review, and record an MCQ submission.

        course_id and student_id must come from trusted backend
        authentication and enrolment context.
        """

        grade = self._assessment_agent.grade_submission(
            submission
        )

        review = self._reviewer.review_grade(grade)

        if not review.approved:
            request = AgentRequest(
                user_id=student_id,
                course_id=course_id,
                role=UserRole.STUDENT,
                message="Review my quiz grade.",
            )

            review_result = AgentResult(
                agent=AgentName.ASSESSMENT,
                content=(
                    "This quiz grade requires teacher review."
                ),
                sources=[],
                requires_human_review=True,
                metadata={
                    "grade": grade.model_dump(mode="json"),
                    "review_type": "quiz_grade",
                },
            )

            self._review_queue.enqueue(
                request=request,
                result=review_result,
                review=review,
            )

            return grade.model_copy(
                update={"requires_human_review": True}
            )

        self._diagnostic_agent.record_quiz_grade(
            course_id=course_id,
            student_id=student_id,
            grade=grade,
            is_follow_up=is_follow_up,
            targeted_tags=targeted_tags,
        )

        return grade

    def course_diagnostic_report(
        self,
        course_id: str,
    ) -> CourseDiagnosticReport:
        """Return the current deterministic course report."""

        return self._diagnostic_agent.build_course_report(
            course_id
        )

    def pending_reviews(
        self,
        *,
        course_id: str | None = None,
    ) -> list[HumanReviewItem]:
        """List pending teacher-review items."""

        return self._review_queue.list_pending(
            course_id=course_id
        )

    def take_review_item(self, review_id: str) -> HumanReviewItem:
        """Transfer a private review item to the durable backend queue."""

        return self._review_queue.take(review_id)

    def resolve_review(
        self,
        *,
        review_id: str,
        action: ReviewAction,
        revised_content: str | None = None,
    ) -> HumanReviewItem:
        """
        Resolve one queue item.

        The backend must enforce teacher authorization before calling
        this method.
        """

        return self._review_queue.resolve(
            review_id=review_id,
            action=action,
            revised_content=revised_content,
        )

    def course_chunk_count(self, course_id: str) -> int:
        """Return the indexed chunk count for one course."""

        normalized_course_id = course_id.strip()

        if not normalized_course_id:
            raise ValueError("course_id cannot be empty.")

        return self._retriever.course_chunk_count(
            normalized_course_id
        )

    def remove_course(self, course_id: str) -> None:
        """Remove one course from the in-memory retriever."""

        normalized_course_id = course_id.strip()

        if not normalized_course_id:
            raise ValueError("course_id cannot be empty.")

        self._retriever.remove_course(
            normalized_course_id
        )

    def _apply_review_gate(
        self,
        *,
        request: AgentRequest,
        result: AgentResult,
        review: ReviewResult,
    ) -> AgentResult:
        if review.approved:
            metadata = {
                **result.metadata,
                "review_action": review.action.value,
                "review_approved": True,
            }

            return result.model_copy(
                update={"metadata": metadata}
            )

        queue_item = self._review_queue.enqueue(
            request=request,
            result=result,
            review=review,
        )

        # Do not return unapproved content, sources, or structured
        # metadata to the student.
        return AgentResult(
            agent=result.agent,
            content=(
                "This response needs instructor review "
                "before it can be shown."
            ),
            sources=[],
            requires_human_review=True,
            metadata={
                "review_action": review.action.value,
                "review_approved": False,
                "review_id": queue_item.review_id,
                "review_issues": review.issues,
            },
        )
