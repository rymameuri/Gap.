from app.ai.rag.chunker import chunk_sections
from app.ai.rag.retriever import (
    InMemoryCourseRetriever,
)
from app.ai.schemas.models import (
    DocumentFormat,
    DocumentSection,
)


def create_chunks(
    document_id: str,
    text: str,
):
    section = DocumentSection(
        document_id=document_id,
        title=document_id,
        format=DocumentFormat.DOCX,
        section_index=1,
        text=text,
    )

    return chunk_sections(
        [section],
        chunk_size_words=50,
        overlap_words=5,
    )


def test_retriever_ranks_relevant_chunk_first() -> None:
    retriever = InMemoryCourseRetriever()

    chunks = (
        create_chunks(
            "forces",
            (
                "Force equals mass times acceleration. "
                "Newton described motion and inertia."
            ),
        )
        + create_chunks(
            "databases",
            (
                "A relational database stores information "
                "using tables and structured queries."
            ),
        )
    )

    retriever.replace_course("physics-101", chunks)

    results = retriever.search(
        "physics-101",
        "mass acceleration force",
    )

    assert results
    assert results[0].source.document_id == "forces"
    assert results[0].relevance_score is not None
    assert results[0].relevance_score > 0


def test_retriever_isolates_courses() -> None:
    retriever = InMemoryCourseRetriever()

    retriever.replace_course(
        "physics-101",
        create_chunks(
            "forces",
            "Newton force acceleration momentum",
        ),
    )

    retriever.replace_course(
        "database-201",
        create_chunks(
            "sql",
            "SQL tables joins transactions indexes",
        ),
    )

    results = retriever.search(
        "database-201",
        "Newton force",
    )

    assert results == []


def test_retriever_returns_empty_for_unknown_terms() -> None:
    retriever = InMemoryCourseRetriever()

    retriever.replace_course(
        "physics-101",
        create_chunks(
            "forces",
            "Newton force acceleration momentum",
        ),
    )

    results = retriever.search(
        "physics-101",
        "photosynthesis chlorophyll",
    )

    assert results == []