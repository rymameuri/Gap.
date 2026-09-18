import asyncio

from app.ai.agents.diagnostic_agent import DiagnosticAgent
from app.ai.schemas.models import (
    AgentName,
    AgentRequest,
    GapStatus,
    QuizGradeResult,
    UserRole,
)


def make_grade(
    *,
    quiz_id: str,
    score: float,
    tags: list[str],
) -> QuizGradeResult:
    return QuizGradeResult(
        quiz_id=quiz_id,
        correct_count=0,
        total_questions=2,
        score_percent=score,
        question_results=[],
        misconception_tags=tags,
        confidence=1.0,
        requires_human_review=False,
    )


def test_clusters_and_ranks_class_gaps() -> None:
    agent = DiagnosticAgent()

    agent.record_quiz_grade(
        course_id="physics-101",
        student_id="student-1",
        grade=make_grade(
            quiz_id="quiz-1",
            score=50,
            tags=[
                "momentum-definition",
                "vector-vs-scalar",
            ],
        ),
    )

    agent.record_quiz_grade(
        course_id="physics-101",
        student_id="student-2",
        grade=make_grade(
            quiz_id="quiz-1",
            score=75,
            tags=["vector-vs-scalar"],
        ),
    )

    report = agent.build_course_report(
        "physics-101"
    )

    assert report.total_students == 2
    assert report.total_attempts == 2
    assert report.average_score == 62.5

    assert report.gap_clusters[0].tag == (
        "vector-vs-scalar"
    )
    assert (
        report.gap_clusters[0].affected_student_count
        == 2
    )
    assert report.gap_clusters[0].prevalence_percent == 100
    assert len(report.at_risk_students) == 1
    assert (
        report.at_risk_students[0].student_id
        == "student-1"
    )


def test_follow_up_can_resolve_gap() -> None:
    agent = DiagnosticAgent()

    agent.record_quiz_grade(
        course_id="physics-101",
        student_id="student-1",
        grade=make_grade(
            quiz_id="initial",
            score=40,
            tags=["momentum-definition"],
        ),
    )

    agent.record_quiz_grade(
        course_id="physics-101",
        student_id="student-1",
        grade=make_grade(
            quiz_id="follow-up",
            score=100,
            tags=[],
        ),
        is_follow_up=True,
        targeted_tags=["momentum-definition"],
    )

    report = agent.build_course_report(
        "physics-101"
    )

    cluster = report.gap_clusters[0]

    assert cluster.status == GapStatus.RESOLVED
    assert cluster.affected_student_count == 0
    assert cluster.resolved_students == ["student-1"]


def test_follow_up_can_remain_struggling() -> None:
    agent = DiagnosticAgent()

    agent.record_quiz_grade(
        course_id="physics-101",
        student_id="student-1",
        grade=make_grade(
            quiz_id="initial",
            score=40,
            tags=["momentum-definition"],
        ),
    )

    agent.record_quiz_grade(
        course_id="physics-101",
        student_id="student-1",
        grade=make_grade(
            quiz_id="follow-up",
            score=50,
            tags=["momentum-definition"],
        ),
        is_follow_up=True,
        targeted_tags=["momentum-definition"],
    )

    report = agent.build_course_report(
        "physics-101"
    )

    assert (
        report.gap_clusters[0].status
        == GapStatus.STILL_STRUGGLING
    )


def test_student_only_receives_own_report() -> None:
    agent = DiagnosticAgent()

    agent.record_quiz_grade(
        course_id="physics-101",
        student_id="student-1",
        grade=make_grade(
            quiz_id="quiz-1",
            score=50,
            tags=["momentum-definition"],
        ),
    )

    agent.record_quiz_grade(
        course_id="physics-101",
        student_id="student-2",
        grade=make_grade(
            quiz_id="quiz-1",
            score=90,
            tags=[],
        ),
    )

    request = AgentRequest(
        user_id="student-1",
        course_id="physics-101",
        role=UserRole.STUDENT,
        message="Show my learning gaps.",
    )

    result = asyncio.run(agent.run(request))

    assert result.agent == AgentName.DIAGNOSTIC
    assert "student_report" in result.metadata
    assert "report" not in result.metadata
    assert (
        result.metadata["student_report"]["student_id"]
        == "student-1"
    )


def test_teacher_receives_course_report() -> None:
    agent = DiagnosticAgent()

    agent.record_quiz_grade(
        course_id="physics-101",
        student_id="student-1",
        grade=make_grade(
            quiz_id="quiz-1",
            score=50,
            tags=["momentum-definition"],
        ),
    )

    request = AgentRequest(
        user_id="teacher-1",
        course_id="physics-101",
        role=UserRole.TEACHER,
        message="Diagnose the class learning gaps.",
    )

    result = asyncio.run(agent.run(request))

    assert result.agent == AgentName.DIAGNOSTIC
    assert result.metadata["deterministic"] is True
    assert "report" in result.metadata
    assert result.metadata["report"]["total_students"] == 1