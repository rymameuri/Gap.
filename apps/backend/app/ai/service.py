from collections.abc import Sequence

from app.ai.agents.assessment_agent import AssessmentAgent
from app.ai.agents.diagnostic_agent import DiagnosticAgent
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
    QuizDifficulty,
    QuizGradeResult,
    QuizSubmission,
    WorkflowResponse,
)


class AIService:
    """
    Backend-callable interface for Manara's AI system.

    This service owns:
    - The course-scoped retriever
    - The Study Agent
    - The Assessment Agent
    - The Diagnostic Agent
    - The orchestration workflow

    Create one AIService instance for the application. Creating a new
    instance for each request would create an empty in-memory index and
    remove access to previously generated quiz answer keys.
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
        Replace one course's complete in-memory document index.

        All documents are loaded and chunked before the existing index
        is replaced. If loading or chunking fails, the previous course
        index remains unchanged.
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

    async def run(
        self,
        request: AgentRequest,
    ) -> WorkflowResponse:
        """Route and execute one AI request."""

        return await self._workflow.run(request)

    async def generate_quiz(
        self,
        *,
        course_id: str,
        topic: str,
        question_count: int = 5,
        difficulty: QuizDifficulty = QuizDifficulty.MEDIUM,
    ) -> AgentResult:
        """Generate a grounded multiple-choice quiz."""

        return await self._assessment_agent.generate_quiz(
            course_id=course_id,
            topic=topic,
            question_count=question_count,
            difficulty=difficulty,
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
        Grade an MCQ submission and update diagnostics.

        course_id and student_id must come from trusted backend
        authentication and enrolment data, not directly from
        unverified frontend values.
        """

        grade = self._assessment_agent.grade_submission(
            submission
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