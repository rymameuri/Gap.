from enum import Enum
from typing import Any, Literal, Optional

from pydantic import BaseModel, Field


class UserRole(str, Enum):
    STUDENT = "student"
    TEACHER = "teacher"


class Intent(str, Enum):
    EXPLAIN_TOPIC = "explain_topic"
    ANSWER_QUESTION = "answer_question"
    GENERATE_QUIZ = "generate_quiz"
    GRADE_ANSWER = "grade_answer"
    DIAGNOSE_GAPS = "diagnose_gaps"
    CREATE_FOLLOW_UP = "create_follow_up"
    UNKNOWN = "unknown"


class AgentName(str, Enum):
    ORCHESTRATOR = "orchestrator"
    STUDY = "study"
    ASSESSMENT = "assessment"
    DIAGNOSTIC = "diagnostic"
    REVIEWER = "reviewer"


class ReviewAction(str, Enum):
    PUBLISH = "publish"
    REVISE = "revise"
    TEACHER_REVIEW = "teacher_review"


class ChatMessage(BaseModel):
    role: Literal["user", "assistant", "system"]
    content: str = Field(min_length=1, max_length=16_000)


class AgentRequest(BaseModel):
    user_id: str = Field(min_length=1)
    course_id: str = Field(min_length=1)
    role: UserRole
    message: str = Field(min_length=1, max_length=10_000)
    conversation_id: Optional[str] = None
    history: list[ChatMessage] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(default_factory=dict)


class SourceReference(BaseModel):
    document_id: str
    title: str
    page: Optional[int] = Field(default=None, ge=1)
    slide: Optional[int] = Field(default=None, ge=1)
    chunk_id: Optional[str] = None


class RetrievedChunk(BaseModel):
    text: str
    source: SourceReference
    relevance_score: Optional[float] = None


class RouteDecision(BaseModel):
    intent: Intent
    target_agent: AgentName
    matched_phrases: list[str] = Field(default_factory=list)
    secondary_intents: list[Intent] = Field(default_factory=list)
    requires_clarification: bool = False
    denied: bool = False
    reason: str


class AgentResult(BaseModel):
    agent: AgentName
    content: str
    sources: list[SourceReference] = Field(default_factory=list)
    requires_human_review: bool = False
    metadata: dict[str, Any] = Field(default_factory=dict)


class ReviewResult(BaseModel):
    action: ReviewAction
    approved: bool
    issues: list[str] = Field(default_factory=list)
    revised_content: Optional[str] = None

class LLMRouteOutput(BaseModel):
    intent: Intent
    reason: str = Field(min_length=1, max_length=300)

class DocumentFormat(str, Enum):
    TEXT = "text"
    PDF = "pdf"
    DOCX = "docx"
    PPTX = "pptx"


class DocumentSection(BaseModel):
    document_id: str = Field(min_length=1)
    title: str = Field(min_length=1)
    format: DocumentFormat
    section_index: int = Field(ge=1)
    text: str = Field(min_length=1)
    page: Optional[int] = Field(default=None, ge=1)
    slide: Optional[int] = Field(default=None, ge=1)

class StudyAgentOutput(BaseModel):
    """Structured output produced by the Study Agent."""

    answer: str = Field(min_length=1, max_length=16_000)
    used_source_ids: list[str] = Field(default_factory=list)

class WorkflowResponse(BaseModel):
    """Final response returned by the AI orchestration workflow."""

    route: RouteDecision
    result: AgentResult

class CourseDocumentInput(BaseModel):
    """Internal reference to a backend-managed course document."""

    document_id: str = Field(min_length=1, max_length=200)
    file_path: str = Field(min_length=1)


class CourseIndexResult(BaseModel):
    """Summary returned after replacing a course search index."""

    course_id: str = Field(min_length=1, max_length=200)
    document_ids: list[str]
    document_count: int = Field(ge=1)
    section_count: int = Field(ge=1)
    chunk_count: int = Field(ge=1)

class QuizDifficulty(str, Enum):
    EASY = "easy"
    MEDIUM = "medium"
    HARD = "hard"


class QuizQuestion(BaseModel):
    question_id: str = Field(min_length=1, max_length=100)
    prompt: str = Field(min_length=1, max_length=2_000)
    choices: list[str] = Field(min_length=4, max_length=4)
    source_ids: list[str] = Field(min_length=1)


class QuizAnswerKeyItem(BaseModel):
    question_id: str = Field(min_length=1, max_length=100)
    correct_choice_index: int = Field(ge=0, le=3)
    explanation: str = Field(min_length=1, max_length=4_000)
    misconception_tag: str = Field(min_length=1, max_length=200)


class QuizGenerationOutput(BaseModel):
    title: str = Field(min_length=1, max_length=300)
    questions: list[QuizQuestion] = Field(min_length=1)
    answer_key: list[QuizAnswerKeyItem] = Field(min_length=1)


class GeneratedQuiz(BaseModel):
    quiz_id: str = Field(min_length=1)
    title: str
    topic: str
    difficulty: QuizDifficulty
    questions: list[QuizQuestion]
    sources: list[SourceReference]


class QuizSubmission(BaseModel):
    quiz_id: str = Field(min_length=1)
    answers: dict[str, int] = Field(default_factory=dict)


class QuestionGrade(BaseModel):
    question_id: str
    selected_choice_index: int | None = None
    correct_choice_index: int
    is_correct: bool
    explanation: str
    misconception_tag: str | None = None


class QuizGradeResult(BaseModel):
    quiz_id: str
    correct_count: int = Field(ge=0)
    total_questions: int = Field(ge=1)
    score_percent: float = Field(ge=0, le=100)
    question_results: list[QuestionGrade]
    misconception_tags: list[str]
    confidence: float = Field(ge=0, le=1)
    requires_human_review: bool = False
class GapStatus(str, Enum):
    OPEN = "open"
    STILL_STRUGGLING = "still_struggling"
    RESOLVED = "resolved"


class GapSeverity(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


class DiagnosticAttempt(BaseModel):
    attempt_id: str = Field(min_length=1)
    course_id: str = Field(min_length=1)
    student_id: str = Field(min_length=1)
    quiz_id: str = Field(min_length=1)
    score_percent: float = Field(ge=0, le=100)
    misconception_tags: list[str] = Field(
        default_factory=list
    )
    is_follow_up: bool = False
    targeted_tags: list[str] = Field(
        default_factory=list
    )


class MisconceptionCluster(BaseModel):
    tag: str
    occurrences: int = Field(ge=0)
    affected_student_count: int = Field(ge=0)
    affected_students: list[str]
    resolved_student_count: int = Field(ge=0)
    resolved_students: list[str]
    prevalence_percent: float = Field(ge=0, le=100)
    severity: GapSeverity
    status: GapStatus


class StudentRiskSummary(BaseModel):
    student_id: str
    attempt_count: int = Field(ge=0)
    average_score: float | None = Field(
        default=None,
        ge=0,
        le=100,
    )
    active_gaps: list[str]
    resolved_gaps: list[str]
    at_risk: bool
    reasons: list[str]


class CourseDiagnosticReport(BaseModel):
    course_id: str
    total_students: int = Field(ge=0)
    total_attempts: int = Field(ge=0)
    average_score: float | None = Field(
        default=None,
        ge=0,
        le=100,
    )
    at_risk_students: list[StudentRiskSummary]
    gap_clusters: list[MisconceptionCluster]

class ReviewQueueStatus(str, Enum):
    PENDING = "pending"
    PUBLISHED = "published"
    REVISED = "revised"


class HumanReviewItem(BaseModel):
    review_id: str = Field(min_length=1)
    course_id: str = Field(min_length=1)
    user_id: str = Field(min_length=1)
    result: AgentResult
    issues: list[str]
    status: ReviewQueueStatus = ReviewQueueStatus.PENDING
    final_content: str | None = None
