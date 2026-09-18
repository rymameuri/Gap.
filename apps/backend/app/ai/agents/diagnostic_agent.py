from collections import Counter
from collections.abc import Sequence
from uuid import uuid4

from app.ai.schemas.models import (
    AgentName,
    AgentRequest,
    AgentResult,
    CourseDiagnosticReport,
    DiagnosticAttempt,
    GapSeverity,
    GapStatus,
    MisconceptionCluster,
    QuizGradeResult,
    StudentRiskSummary,
    UserRole,
)


class DiagnosticAgent:
    """
    Deterministically aggregates quiz outcomes into learning gaps.

    No LLM is used for calculations, ranking, risk classification,
    or follow-up status updates.
    """

    def __init__(
        self,
        *,
        at_risk_score_threshold: float = 60.0,
        active_gap_threshold: int = 2,
        high_prevalence_threshold: float = 0.50,
        medium_prevalence_threshold: float = 0.25,
    ) -> None:
        if not 0 <= at_risk_score_threshold <= 100:
            raise ValueError(
                "at_risk_score_threshold must be between "
                "0 and 100."
            )

        if active_gap_threshold < 1:
            raise ValueError(
                "active_gap_threshold must be at least 1."
            )

        if not (
            0
            <= medium_prevalence_threshold
            <= high_prevalence_threshold
            <= 1
        ):
            raise ValueError(
                "Prevalence thresholds must satisfy "
                "0 <= medium <= high <= 1."
            )

        self._at_risk_score_threshold = (
            at_risk_score_threshold
        )
        self._active_gap_threshold = active_gap_threshold
        self._high_prevalence_threshold = (
            high_prevalence_threshold
        )
        self._medium_prevalence_threshold = (
            medium_prevalence_threshold
        )

        self._attempts: dict[
            str,
            list[DiagnosticAttempt],
        ] = {}

        self._gap_statuses: dict[
            tuple[str, str, str],
            GapStatus,
        ] = {}

    def record_quiz_grade(
        self,
        *,
        course_id: str,
        student_id: str,
        grade: QuizGradeResult,
        is_follow_up: bool = False,
        targeted_tags: Sequence[str] = (),
        attempt_id: str | None = None,
    ) -> DiagnosticAttempt:
        normalized_course_id = course_id.strip()
        normalized_student_id = student_id.strip()

        if not normalized_course_id:
            raise ValueError("course_id cannot be empty.")

        if not normalized_student_id:
            raise ValueError("student_id cannot be empty.")

        misconception_tags = self._normalize_tags(
            grade.misconception_tags
        )
        normalized_targets = self._normalize_tags(
            targeted_tags
        )

        if is_follow_up and not normalized_targets:
            raise ValueError(
                "A follow-up attempt requires targeted_tags."
            )

        attempt = DiagnosticAttempt(
            attempt_id=attempt_id or uuid4().hex,
            course_id=normalized_course_id,
            student_id=normalized_student_id,
            quiz_id=grade.quiz_id,
            score_percent=grade.score_percent,
            misconception_tags=misconception_tags,
            is_follow_up=is_follow_up,
            targeted_tags=normalized_targets,
        )

        self._attempts.setdefault(
            normalized_course_id,
            [],
        ).append(attempt)

        if is_follow_up:
            misconception_set = set(misconception_tags)

            for tag in normalized_targets:
                status = (
                    GapStatus.STILL_STRUGGLING
                    if tag in misconception_set
                    else GapStatus.RESOLVED
                )

                self._gap_statuses[
                    (
                        normalized_course_id,
                        normalized_student_id,
                        tag,
                    )
                ] = status

            # A follow-up can also reveal a new, untargeted gap.
            for tag in misconception_set - set(
                normalized_targets
            ):
                self._gap_statuses[
                    (
                        normalized_course_id,
                        normalized_student_id,
                        tag,
                    )
                ] = GapStatus.OPEN
        else:
            for tag in misconception_tags:
                self._gap_statuses[
                    (
                        normalized_course_id,
                        normalized_student_id,
                        tag,
                    )
                ] = GapStatus.OPEN

        return attempt

    def build_course_report(
        self,
        course_id: str,
    ) -> CourseDiagnosticReport:
        normalized_course_id = course_id.strip()

        if not normalized_course_id:
            raise ValueError("course_id cannot be empty.")

        attempts = list(
            self._attempts.get(normalized_course_id, [])
        )

        student_ids = sorted(
            {
                attempt.student_id
                for attempt in attempts
            }
        )

        student_summaries = [
            self._build_student_summary(
                course_id=normalized_course_id,
                student_id=student_id,
                attempts=attempts,
            )
            for student_id in student_ids
        ]

        at_risk_students = sorted(
            (
                summary
                for summary in student_summaries
                if summary.at_risk
            ),
            key=lambda summary: (
                summary.average_score
                if summary.average_score is not None
                else 101,
                summary.student_id,
            ),
        )

        occurrence_counts = Counter(
            tag
            for attempt in attempts
            for tag in attempt.misconception_tags
        )

        known_tags = set(occurrence_counts)

        known_tags.update(
            tag
            for (
                status_course_id,
                _student_id,
                tag,
            ) in self._gap_statuses
            if status_course_id == normalized_course_id
        )

        clusters = [
            self._build_cluster(
                course_id=normalized_course_id,
                tag=tag,
                occurrence_count=occurrence_counts[tag],
                total_students=len(student_ids),
            )
            for tag in known_tags
        ]

        clusters.sort(
            key=lambda cluster: (
                cluster.status == GapStatus.RESOLVED,
                -cluster.affected_student_count,
                -cluster.occurrences,
                cluster.tag,
            )
        )

        average_score = (
            round(
                sum(
                    attempt.score_percent
                    for attempt in attempts
                )
                / len(attempts),
                2,
            )
            if attempts
            else None
        )

        return CourseDiagnosticReport(
            course_id=normalized_course_id,
            total_students=len(student_ids),
            total_attempts=len(attempts),
            average_score=average_score,
            at_risk_students=at_risk_students,
            gap_clusters=clusters,
        )

    async def run(
        self,
        request: AgentRequest,
    ) -> AgentResult:
        report = self.build_course_report(
            request.course_id
        )

        if request.role == UserRole.STUDENT:
            student_summary = next(
                (
                    summary
                    for summary in self._all_student_summaries(
                        report.course_id
                    )
                    if summary.student_id == request.user_id
                ),
                StudentRiskSummary(
                    student_id=request.user_id,
                    attempt_count=0,
                    average_score=None,
                    active_gaps=[],
                    resolved_gaps=[],
                    at_risk=False,
                    reasons=[],
                ),
            )

            return AgentResult(
                agent=AgentName.DIAGNOSTIC,
                content=(
                    f"You currently have "
                    f"{len(student_summary.active_gaps)} "
                    "active learning gaps and "
                    f"{len(student_summary.resolved_gaps)} "
                    "resolved gaps."
                ),
                sources=[],
                requires_human_review=False,
                metadata={
                    "deterministic": True,
                    "student_report": (
                        student_summary.model_dump(
                            mode="json"
                        )
                    ),
                },
            )

        return AgentResult(
            agent=AgentName.DIAGNOSTIC,
            content=(
                f"I found {len(report.gap_clusters)} "
                "misconception clusters and "
                f"{len(report.at_risk_students)} "
                "at-risk students."
            ),
            sources=[],
            requires_human_review=False,
            metadata={
                "deterministic": True,
                "report": report.model_dump(mode="json"),
            },
        )

    def _all_student_summaries(
        self,
        course_id: str,
    ) -> list[StudentRiskSummary]:
        attempts = list(
            self._attempts.get(course_id, [])
        )

        student_ids = sorted(
            {
                attempt.student_id
                for attempt in attempts
            }
        )

        return [
            self._build_student_summary(
                course_id=course_id,
                student_id=student_id,
                attempts=attempts,
            )
            for student_id in student_ids
        ]

    def _build_student_summary(
        self,
        *,
        course_id: str,
        student_id: str,
        attempts: Sequence[DiagnosticAttempt],
    ) -> StudentRiskSummary:
        student_attempts = [
            attempt
            for attempt in attempts
            if attempt.student_id == student_id
        ]

        average_score = (
            round(
                sum(
                    attempt.score_percent
                    for attempt in student_attempts
                )
                / len(student_attempts),
                2,
            )
            if student_attempts
            else None
        )

        active_gaps: list[str] = []
        resolved_gaps: list[str] = []

        for (
            status_course_id,
            status_student_id,
            tag,
        ), status in self._gap_statuses.items():
            if (
                status_course_id != course_id
                or status_student_id != student_id
            ):
                continue

            if status == GapStatus.RESOLVED:
                resolved_gaps.append(tag)
            else:
                active_gaps.append(tag)

        active_gaps.sort()
        resolved_gaps.sort()

        reasons: list[str] = []

        if (
            average_score is not None
            and average_score
            < self._at_risk_score_threshold
        ):
            reasons.append(
                "Average quiz score is below "
                f"{self._at_risk_score_threshold:g}%."
            )

        if len(active_gaps) >= self._active_gap_threshold:
            reasons.append(
                "Student has "
                f"{len(active_gaps)} active learning gaps."
            )

        return StudentRiskSummary(
            student_id=student_id,
            attempt_count=len(student_attempts),
            average_score=average_score,
            active_gaps=active_gaps,
            resolved_gaps=resolved_gaps,
            at_risk=bool(reasons),
            reasons=reasons,
        )

    def _build_cluster(
        self,
        *,
        course_id: str,
        tag: str,
        occurrence_count: int,
        total_students: int,
    ) -> MisconceptionCluster:
        active_students: list[str] = []
        resolved_students: list[str] = []
        has_still_struggling = False

        for (
            status_course_id,
            student_id,
            status_tag,
        ), status in self._gap_statuses.items():
            if (
                status_course_id != course_id
                or status_tag != tag
            ):
                continue

            if status == GapStatus.RESOLVED:
                resolved_students.append(student_id)
            else:
                active_students.append(student_id)

                if status == GapStatus.STILL_STRUGGLING:
                    has_still_struggling = True

        active_students.sort()
        resolved_students.sort()

        prevalence = (
            len(active_students) / total_students
            if total_students
            else 0.0
        )

        if prevalence >= self._high_prevalence_threshold:
            severity = GapSeverity.HIGH
        elif prevalence >= self._medium_prevalence_threshold:
            severity = GapSeverity.MEDIUM
        else:
            severity = GapSeverity.LOW

        if active_students:
            status = (
                GapStatus.STILL_STRUGGLING
                if has_still_struggling
                else GapStatus.OPEN
            )
        else:
            status = GapStatus.RESOLVED

        return MisconceptionCluster(
            tag=tag,
            occurrences=occurrence_count,
            affected_student_count=len(active_students),
            affected_students=active_students,
            resolved_student_count=len(resolved_students),
            resolved_students=resolved_students,
            prevalence_percent=round(
                prevalence * 100,
                2,
            ),
            severity=severity,
            status=status,
        )

    @staticmethod
    def _normalize_tags(
        tags: Sequence[str],
    ) -> list[str]:
        normalized = [
            tag.strip().lower()
            for tag in tags
            if tag.strip()
        ]

        return list(dict.fromkeys(normalized))