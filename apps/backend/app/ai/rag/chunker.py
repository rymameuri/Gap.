from __future__ import annotations

import hashlib
from collections.abc import Sequence

from app.ai.schemas.models import (
    DocumentSection,
    RetrievedChunk,
    SourceReference,
)


DEFAULT_CHUNK_SIZE_WORDS = 180
DEFAULT_OVERLAP_WORDS = 30


def _create_chunk_id(
    section: DocumentSection,
    chunk_number: int,
    text: str,
) -> str:
    identity = (
        f"{section.document_id}\0"
        f"{section.section_index}\0"
        f"{chunk_number}\0"
        f"{text}"
    )

    digest = hashlib.sha256(
        identity.encode("utf-8")
    ).hexdigest()[:16]

    return f"{section.document_id}:{digest}"


def chunk_sections(
    sections: Sequence[DocumentSection],
    chunk_size_words: int = DEFAULT_CHUNK_SIZE_WORDS,
    overlap_words: int = DEFAULT_OVERLAP_WORDS,
) -> list[RetrievedChunk]:
    if chunk_size_words < 1:
        raise ValueError(
            "chunk_size_words must be greater than zero."
        )

    if overlap_words < 0:
        raise ValueError(
            "overlap_words cannot be negative."
        )

    if overlap_words >= chunk_size_words:
        raise ValueError(
            "overlap_words must be smaller than chunk_size_words."
        )

    chunks: list[RetrievedChunk] = []
    step = chunk_size_words - overlap_words

    for section in sections:
        words = section.text.split()

        if not words:
            continue

        chunk_number = 1

        for start in range(0, len(words), step):
            end = min(start + chunk_size_words, len(words))
            text = " ".join(words[start:end])

            chunk_id = _create_chunk_id(
                section,
                chunk_number,
                text,
            )

            chunks.append(
                RetrievedChunk(
                    text=text,
                    source=SourceReference(
                        document_id=section.document_id,
                        title=section.title,
                        page=section.page,
                        slide=section.slide,
                        chunk_id=chunk_id,
                    ),
                )
            )

            chunk_number += 1

            if end == len(words):
                break

    return chunks