import asyncio

from app.ai.orchestration.workflow import AgentWorkflow
from app.ai.schemas.models import (
    AgentName,
    AgentRequest,
    AgentResult,
    Intent,
    RouteDecision,
    UserRole,
)


class FakeRouter:
    def __init__(self, decision: RouteDecision) -> None:
        self.decision = decision
        self.calls: list[AgentRequest] = []

    async def __call__(
        self,
        request: AgentRequest,
    ) -> RouteDecision:
        self.calls.append(request)
        return self.decision


class FailingRouter:
    async def __call__(
        self,
        request: AgentRequest,
    ) -> RouteDecision:
        raise RuntimeError("Simulated router failure.")


class FakeAgent:
    def __init__(
        self,
        result: AgentResult | None = None,
        *,
        should_fail: bool = False,
    ) -> None:
        self.result = result
        self.should_fail = should_fail
        self.calls: list[AgentRequest] = []

    async def run(
        self,
        request: AgentRequest,
    ) -> AgentResult:
        self.calls.append(request)

        if self.should_fail:
            raise RuntimeError("Simulated agent failure.")

        if self.result is None:
            raise AssertionError("FakeAgent requires a result.")

        return self.result


def make_request() -> AgentRequest:
    return AgentRequest(
        user_id="student-1",
        course_id="physics-101",
        role=UserRole.STUDENT,
        message="Explain momentum.",
    )


def make_route(
    *,
    target_agent: AgentName = AgentName.STUDY,
    denied: bool = False,
    requires_clarification: bool = False,
) -> RouteDecision:
    return RouteDecision(
        intent=Intent.EXPLAIN_TOPIC,
        target_agent=target_agent,
        matched_phrases=["explain"],
        secondary_intents=[],
        requires_clarification=requires_clarification,
        denied=denied,
        reason="Test routing decision.",
    )


def make_study_result() -> AgentResult:
    return AgentResult(
        agent=AgentName.STUDY,
        content="Momentum equals mass multiplied by velocity [S1].",
        sources=[],
        requires_human_review=False,
        metadata={"grounded": True},
    )


def test_dispatches_request_to_selected_agent() -> None:
    router = FakeRouter(make_route())
    study_agent = FakeAgent(make_study_result())

    workflow = AgentWorkflow(
        agents={AgentName.STUDY: study_agent},
        router=router,
    )

    response = asyncio.run(workflow.run(make_request()))

    assert response.route.target_agent == AgentName.STUDY
    assert response.result.agent == AgentName.STUDY
    assert response.result.metadata["grounded"] is True
    assert len(study_agent.calls) == 1


def test_denied_request_does_not_call_specialist() -> None:
    router = FakeRouter(make_route(denied=True))
    study_agent = FakeAgent(make_study_result())

    workflow = AgentWorkflow(
        agents={AgentName.STUDY: study_agent},
        router=router,
    )

    response = asyncio.run(workflow.run(make_request()))

    assert response.result.agent == AgentName.ORCHESTRATOR
    assert response.result.metadata["workflow_status"] == "denied"
    assert response.result.requires_human_review is False
    assert study_agent.calls == []


def test_clarification_does_not_call_specialist() -> None:
    router = FakeRouter(
        make_route(requires_clarification=True)
    )
    study_agent = FakeAgent(make_study_result())

    workflow = AgentWorkflow(
        agents={AgentName.STUDY: study_agent},
        router=router,
    )

    response = asyncio.run(workflow.run(make_request()))

    assert response.result.agent == AgentName.ORCHESTRATOR
    assert (
        response.result.metadata["workflow_status"]
        == "clarification_required"
    )
    assert study_agent.calls == []


def test_missing_specialist_returns_safe_response() -> None:
    router = FakeRouter(
        make_route(target_agent=AgentName.ASSESSMENT)
    )

    workflow = AgentWorkflow(
        agents={},
        router=router,
    )

    response = asyncio.run(workflow.run(make_request()))

    assert response.result.agent == AgentName.ORCHESTRATOR
    assert (
        response.result.metadata["workflow_status"]
        == "agent_unavailable"
    )
    assert response.result.requires_human_review is False


def test_specialist_failure_requires_human_review() -> None:
    router = FakeRouter(make_route())
    study_agent = FakeAgent(should_fail=True)

    workflow = AgentWorkflow(
        agents={AgentName.STUDY: study_agent},
        router=router,
    )

    response = asyncio.run(workflow.run(make_request()))

    assert response.result.agent == AgentName.ORCHESTRATOR
    assert response.result.requires_human_review is True
    assert (
        response.result.metadata["workflow_status"]
        == "agent_execution_failed"
    )


def test_agent_identity_mismatch_requires_review() -> None:
    router = FakeRouter(make_route())
    wrong_agent = FakeAgent(
        AgentResult(
            agent=AgentName.ASSESSMENT,
            content="Unexpected result.",
            sources=[],
            requires_human_review=False,
            metadata={},
        )
    )

    workflow = AgentWorkflow(
        agents={AgentName.STUDY: wrong_agent},
        router=router,
    )

    response = asyncio.run(workflow.run(make_request()))

    assert response.result.agent == AgentName.ORCHESTRATOR
    assert response.result.requires_human_review is True
    assert (
        response.result.metadata["workflow_status"]
        == "agent_identity_mismatch"
    )


def test_router_failure_returns_safe_clarification() -> None:
    workflow = AgentWorkflow(
        agents={},
        router=FailingRouter(),
    )

    response = asyncio.run(workflow.run(make_request()))

    assert response.route.intent == Intent.UNKNOWN
    assert response.route.requires_clarification is True
    assert response.result.agent == AgentName.ORCHESTRATOR
    assert (
        response.result.metadata["workflow_status"]
        == "clarification_required"
    )