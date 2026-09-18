import json
from uuid import uuid4

from app.ai.agents.study_agent import (
    AsyncCompletionClient,
    CourseRetriever,
)
from app.ai.llm.client import (
    LLMConfigurationError,
    LLMGatewayError,
    QuantumBlackLLMClient,
)
from app.ai.prompts.assessment import (
    build_assessment_messages,
)
from app.ai.schemas.models import (
    AgentName,
    AgentRequest,
    AgentResult,
    GeneratedQuiz,
    QuestionGrade,
    QuizAnswerKeyItem,
    QuizDifficulty,
    QuizGenerationOutput,
    QuizGradeResult,
    QuizSubmission,
    SourceReference,
)


class AssessmentAgentError(ValueError):
    """Base error for Assessment Agent operations."""


class AssessmentOutputError(AssessmentAgentError):
    """Raised when generated quiz output cannot be verified."""


class UnknownQuizError(AssessmentAgentError):
    """Raised when grading references an unknown quiz."""


def _parse_generation_output(
    text: str,
) -> QuizGenerationOutput:
    start = text.find("{")
    end = text.rfind("}")

    if start == -1 or end == -1 or end < start:
        raise AssessmentOutputError(
            "The response did not contain a JSON object."
        )

    try:
        payload = json.loads(text[start : end + 1])
        return QuizGenerationOutput.model_validate(payload)
    except (json.JSONDecodeError, ValueError) as exc:
        raise AssessmentOutputError(
            "The generated quiz did not match the required schema."
        ) from exc


class AssessmentAgent:
    """Generates grounded MCQ quizzes and grades them deterministically."""

    def __init__(
        self,
        retriever: CourseRetriever,
        llm_client: AsyncCompletionClient | None = None,
        *,
        retrieval_limit: int = 5,
        default_question_count: int = 5,
        default_difficulty: QuizDifficulty = QuizDifficulty.MEDIUM,
        max_completion_tokens: int = 2_500,
    ) -> None:
        if retrieval_limit < 1:
            raise ValueError(
                "retrieval_limit must be at least 1."
            )

        if not 1 <= default_question_count <= 10:
            raise ValueError(
                "default_question_count must be between 1 and 10."
            )

        if max_completion_tokens < 1:
            raise ValueError(
                "max_completion_tokens must be at least 1."
            )

        self._retriever = retriever
        self._llm_client = llm_client
        self._retrieval_limit = retrieval_limit
        self._default_question_count = default_question_count
        self._default_difficulty = default_difficulty
        self._max_completion_tokens = max_completion_tokens

        self._quizzes: dict[str, GeneratedQuiz] = {}
        self._answer_keys: dict[
            str,
            dict[str, QuizAnswerKeyItem],
        ] = {}

    async def run(
        self,
        request: AgentRequest,
    ) -> AgentResult:
        return await self.generate_quiz(
            course_id=request.course_id,
            topic=request.message,
            question_count=self._default_question_count,
            difficulty=self._default_difficulty,
        )

    async def generate_quiz(
        self,
        *,
        course_id: str,
        topic: str,
        question_count: int = 5,
        difficulty: QuizDifficulty = QuizDifficulty.MEDIUM,
    ) -> AgentResult:
        if not course_id.strip():
            raise ValueError("course_id cannot be empty.")

        if not topic.strip():
            raise ValueError("topic cannot be empty.")

        if not 1 <= question_count <= 10:
            raise ValueError(
                "question_count must be between 1 and 10."
            )

        chunks = self._retriever.search(
            course_id=course_id,
            query=topic,
            limit=self._retrieval_limit,
        )

        if not chunks:
            return AgentResult(
                agent=AgentName.ASSESSMENT,
                content=(
                    "I couldn’t find enough information in this "
                    "course’s materials to create that quiz."
                ),
                sources=[],
                requires_human_review=False,
                metadata={
                    "grounded": False,
                    "retrieved_count": 0,
                    "reason": "no_retrieval_results",
                },
            )

        messages, source_map = build_assessment_messages(
            topic=topic,
            chunks=chunks,
            question_count=question_count,
            difficulty=difficulty,
        )

        try:
            client = (
                self._llm_client
                if self._llm_client is not None
                else QuantumBlackLLMClient()
            )

            response = await client.acomplete(
                messages,
                max_completion_tokens=self._max_completion_tokens,
            )

            output = _parse_generation_output(response.text)

            self._validate_generation(
                output=output,
                source_map=source_map,
                expected_question_count=question_count,
            )
        except (
            LLMConfigurationError,
            LLMGatewayError,
            AssessmentOutputError,
        ):
            return AgentResult(
                agent=AgentName.ASSESSMENT,
                content=(
                    "I found relevant course material, but I "
                    "couldn’t create a fully verified quiz. "
                    "It has been marked for review."
                ),
                sources=[],
                requires_human_review=True,
                metadata={
                    "grounded": False,
                    "retrieved_count": len(chunks),
                    "reason": "generation_or_validation_failed",
                },
            )

        used_source_ids = list(
            dict.fromkeys(
                source_id
                for question in output.questions
                for source_id in question.source_ids
            )
        )

        sources: list[SourceReference] = [
            source_map[source_id]
            for source_id in used_source_ids
        ]

        quiz_id = uuid4().hex

        quiz = GeneratedQuiz(
            quiz_id=quiz_id,
            title=output.title,
            topic=topic.strip(),
            difficulty=difficulty,
            questions=output.questions,
            sources=sources,
        )

        self._quizzes[quiz_id] = quiz
        self._answer_keys[quiz_id] = {
            item.question_id: item
            for item in output.answer_key
        }

        return AgentResult(
            agent=AgentName.ASSESSMENT,
            content=(
                f"I created a {len(quiz.questions)}-question "
                f"quiz: {quiz.title}"
            ),
            sources=sources,
            requires_human_review=False,
            metadata={
                "grounded": True,
                "retrieved_count": len(chunks),
                "quiz_id": quiz_id,
                "quiz": quiz.model_dump(mode="json"),
                "used_source_ids": used_source_ids,
            },
        )

    def grade_submission(
        self,
        submission: QuizSubmission,
    ) -> QuizGradeResult:
        quiz = self._quizzes.get(submission.quiz_id)
        answer_key = self._answer_keys.get(submission.quiz_id)

        if quiz is None or answer_key is None:
            raise UnknownQuizError(
                f"Unknown quiz ID: {submission.quiz_id}"
            )

        valid_question_ids = {
            question.question_id
            for question in quiz.questions
        }

        unknown_question_ids = (
            set(submission.answers) - valid_question_ids
        )

        if unknown_question_ids:
            raise ValueError(
                "Submission contains unknown question IDs: "
                + ", ".join(sorted(unknown_question_ids))
            )

        question_results: list[QuestionGrade] = []
        misconception_tags: list[str] = []
        correct_count = 0

        for question in quiz.questions:
            key = answer_key[question.question_id]
            selected_index = submission.answers.get(
                question.question_id
            )

            if selected_index is not None and not (
                0 <= selected_index < len(question.choices)
            ):
                raise ValueError(
                    "Selected choice index is outside the "
                    f"valid range for {question.question_id}."
                )

            is_correct = (
                selected_index == key.correct_choice_index
            )

            if is_correct:
                correct_count += 1
                misconception_tag = None
            else:
                misconception_tag = key.misconception_tag
                misconception_tags.append(
                    key.misconception_tag
                )

            question_results.append(
                QuestionGrade(
                    question_id=question.question_id,
                    selected_choice_index=selected_index,
                    correct_choice_index=(
                        key.correct_choice_index
                    ),
                    is_correct=is_correct,
                    explanation=key.explanation,
                    misconception_tag=misconception_tag,
                )
            )

        total_questions = len(quiz.questions)
        score_percent = round(
            correct_count / total_questions * 100,
            2,
        )

        return QuizGradeResult(
            quiz_id=quiz.quiz_id,
            correct_count=correct_count,
            total_questions=total_questions,
            score_percent=score_percent,
            question_results=question_results,
            misconception_tags=list(
                dict.fromkeys(misconception_tags)
            ),
            confidence=1.0,
            requires_human_review=False,
        )

    @staticmethod
    def _validate_generation(
        *,
        output: QuizGenerationOutput,
        source_map: dict[str, SourceReference],
        expected_question_count: int,
    ) -> None:
        if len(output.questions) != expected_question_count:
            raise AssessmentOutputError(
                "The generated question count was incorrect."
            )

        question_ids = [
            question.question_id
            for question in output.questions
        ]

        if len(question_ids) != len(set(question_ids)):
            raise AssessmentOutputError(
                "Question IDs must be unique."
            )

        answer_ids = [
            item.question_id
            for item in output.answer_key
        ]

        if len(answer_ids) != len(set(answer_ids)):
            raise AssessmentOutputError(
                "Answer-key IDs must be unique."
            )

        if set(question_ids) != set(answer_ids):
            raise AssessmentOutputError(
                "The answer key does not match the questions."
            )

        answer_map = {
            item.question_id: item
            for item in output.answer_key
        }

        for question in output.questions:
            unknown_sources = [
                source_id
                for source_id in question.source_ids
                if source_id not in source_map
            ]

            if unknown_sources:
                raise AssessmentOutputError(
                    "A question referenced an unknown source."
                )

            answer = answer_map[question.question_id]

            if answer.correct_choice_index >= len(
                question.choices
            ):
                raise AssessmentOutputError(
                    "A correct answer index was invalid."
                )

            has_verified_citation = any(
                f"[{source_id}]" in answer.explanation
                for source_id in question.source_ids
            )

            if not has_verified_citation:
                raise AssessmentOutputError(
                    "An answer explanation lacked a verified "
                    "source citation."
                )