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
    content: str = Field(min_length=1)


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

    answer: str = Field(min_length=1, max_length=10_000)
    used_source_ids: list[str] = Field(default_factory=list)