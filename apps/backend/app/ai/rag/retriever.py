from __future__ import annotations

import math
import re
from collections import Counter
from collections.abc import Sequence
from dataclasses import dataclass, field

from app.ai.schemas.models import RetrievedChunk


_TOKEN_PATTERN = re.compile(r"\b\w+\b", re.UNICODE)


def _tokenise(text: str) -> list[str]:
    tokens: list[str] = []

    for token in _TOKEN_PATTERN.findall(text.casefold()):
        tokens.append(token)

        # Keep the original token and add a conservative singular variant.
        # This lets natural queries such as "three units" match material
        # containing "Unit 1" without requiring an external stemmer.
        if (
            len(token) > 3
            and token.endswith("s")
            and not token.endswith(("ss", "is", "us"))
        ):
            tokens.append(token[:-1])

    return tokens


@dataclass
class InMemoryCourseRetriever:
    k1: float = 1.5
    b: float = 0.75
    _chunks_by_course: dict[
        str,
        list[RetrievedChunk],
    ] = field(
        default_factory=dict,
        init=False,
        repr=False,
    )

    def __post_init__(self) -> None:
        if self.k1 <= 0:
            raise ValueError("k1 must be greater than zero.")

        if not 0 <= self.b <= 1:
            raise ValueError("b must be between zero and one.")

    def replace_course(
        self,
        course_id: str,
        chunks: Sequence[RetrievedChunk],
    ) -> None:
        if not course_id.strip():
            raise ValueError("course_id cannot be empty.")

        self._chunks_by_course[course_id] = list(chunks)

    def remove_course(self, course_id: str) -> None:
        self._chunks_by_course.pop(course_id, None)

    def course_chunk_count(self, course_id: str) -> int:
        return len(self._chunks_by_course.get(course_id, []))

    def course_overview(
        self,
        course_id: str,
        limit: int = 256,
    ) -> list[RetrievedChunk]:
        """Return course chunks in source order for broad overview requests."""

        if not course_id.strip():
            raise ValueError("course_id cannot be empty.")

        if limit < 1:
            raise ValueError("limit must be greater than zero.")

        chunks = self._chunks_by_course.get(course_id, [])
        if len(chunks) <= limit:
            selected = chunks
        else:
            groups: list[list[RetrievedChunk]] = []
            positions: dict[str, int] = {}
            for chunk in chunks:
                document_id = chunk.source.document_id
                position = positions.get(document_id)
                if position is None:
                    positions[document_id] = len(groups)
                    groups.append([chunk])
                else:
                    groups[position].append(chunk)

            per_document = max(1, limit // len(groups))
            selected = []
            for group in groups:
                selected.extend(group[:per_document])
            selected = selected[:limit]

            offset = per_document
            while len(selected) < limit:
                added = False
                for group in groups:
                    if offset < len(group):
                        selected.append(group[offset])
                        added = True
                        if len(selected) == limit:
                            break
                if not added:
                    break
                offset += 1

        return [
            chunk.model_copy(update={"relevance_score": None})
            for chunk in selected
        ]

    def search(
        self,
        course_id: str,
        query: str,
        limit: int = 5,
    ) -> list[RetrievedChunk]:
        if not course_id.strip():
            raise ValueError("course_id cannot be empty.")

        if not query.strip():
            raise ValueError("query cannot be empty.")

        if limit < 1:
            raise ValueError("limit must be greater than zero.")

        chunks = self._chunks_by_course.get(course_id, [])

        if not chunks:
            return []

        query_terms = set(_tokenise(query))

        if not query_terms:
            return []

        tokenised_documents = [
            _tokenise(chunk.text)
            for chunk in chunks
        ]

        document_count = len(tokenised_documents)

        average_length = (
            sum(len(tokens) for tokens in tokenised_documents)
            / document_count
        )

        if average_length == 0:
            return []

        document_frequency: Counter[str] = Counter()

        for tokens in tokenised_documents:
            document_frequency.update(set(tokens))

        scored_chunks: list[
            tuple[float, RetrievedChunk]
        ] = []

        for chunk, tokens in zip(
            chunks,
            tokenised_documents,
            strict=True,
        ):
            frequencies = Counter(tokens)
            document_length = len(tokens)
            score = 0.0

            for term in query_terms:
                term_frequency = frequencies.get(term, 0)

                if term_frequency == 0:
                    continue

                frequency = document_frequency[term]

                inverse_document_frequency = math.log(
                    1
                    + (
                        document_count
                        - frequency
                        + 0.5
                    )
                    / (frequency + 0.5)
                )

                numerator = term_frequency * (self.k1 + 1)

                denominator = term_frequency + self.k1 * (
                    1
                    - self.b
                    + self.b
                    * document_length
                    / average_length
                )

                score += (
                    inverse_document_frequency
                    * numerator
                    / denominator
                )

            if score > 0:
                scored_chunks.append((score, chunk))

        scored_chunks.sort(
            key=lambda item: (
                -item[0],
                item[1].source.chunk_id or "",
            )
        )

        return [
            chunk.model_copy(
                update={
                    "relevance_score": round(score, 6),
                }
            )
            for score, chunk in scored_chunks[:limit]
        ]
