from collections.abc import Sequence

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
    CourseDocumentInput,
    CourseIndexResult,
    WorkflowResponse,
)


class AIService:
    """
    Backend-callable interface for Manara's AI system.

    The service owns:
    - The course-scoped retriever
    - The Study Agent
    - The orchestration workflow

    Create one service instance for the application. Creating a new instance
    for every request would create a new empty in-memory index.
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

        self._retriever = (
            retriever
            if retriever is not None
            else InMemoryCourseRetriever()
        )
        self._chunk_size_words = chunk_size_words
        self._overlap_words = overlap_words

        study_agent = StudyAgent(
            retriever=self._retriever,
            llm_client=llm_client,
            retrieval_limit=retrieval_limit,
        )

        self._workflow = AgentWorkflow(
            agents={
                AgentName.STUDY: study_agent,
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

        Loading and chunking finish before the existing course index is
        replaced. If one document fails, replace_course() is never called,
        so the previous index remains available.
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

        all_sections = []

        for document, document_id in zip(
            document_list,
            document_ids,
            strict=True,
        ):
            sections = load_document(
                file_path=document.file_path,
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
                "The course documents produced no searchable chunks."
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

    def course_chunk_count(self, course_id: str) -> int:
        normalized_course_id = course_id.strip()

        if not normalized_course_id:
            raise ValueError("course_id cannot be empty.")

        return self._retriever.course_chunk_count(
            normalized_course_id
        )

    def remove_course(self, course_id: str) -> None:
        normalized_course_id = course_id.strip()

        if not normalized_course_id:
            raise ValueError("course_id cannot be empty.")

        self._retriever.remove_course(
            normalized_course_id
        )