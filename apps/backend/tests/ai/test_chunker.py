from app.ai.rag.chunker import chunk_sections
from app.ai.schemas.models import (
    DocumentFormat,
    DocumentSection,
)


def make_section() -> DocumentSection:
    return DocumentSection(
        document_id="physics-notes",
        title="Physics notes",
        format=DocumentFormat.PDF,
        section_index=3,
        page=3,
        text=(
            "one two three four five "
            "six seven eight"
        ),
    )


def test_chunks_preserve_metadata_and_overlap() -> None:
    chunks = chunk_sections(
        [make_section()],
        chunk_size_words=5,
        overlap_words=2,
    )

    assert len(chunks) == 2
    assert chunks[0].text == "one two three four five"
    assert chunks[1].text == "four five six seven eight"
    assert chunks[0].source.document_id == "physics-notes"
    assert chunks[0].source.page == 3
    assert chunks[0].source.chunk_id is not None


def test_chunk_ids_are_stable() -> None:
    first = chunk_sections(
        [make_section()],
        chunk_size_words=5,
        overlap_words=2,
    )

    second = chunk_sections(
        [make_section()],
        chunk_size_words=5,
        overlap_words=2,
    )

    assert first[0].source.chunk_id == (
        second[0].source.chunk_id
    )


def test_invalid_chunk_settings_are_rejected() -> None:
    invalid_settings = (
        (0, 0),
        (5, -1),
        (5, 5),
    )

    for chunk_size, overlap in invalid_settings:
        try:
            chunk_sections(
                [make_section()],
                chunk_size_words=chunk_size,
                overlap_words=overlap,
            )
        except ValueError:
            continue

        raise AssertionError(
            "Invalid chunk settings were accepted."
        )