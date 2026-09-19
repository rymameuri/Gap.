import asyncio
from pathlib import Path
from types import SimpleNamespace

import pytest

from app.ai.llm.client import (
    LLMConfigurationError,
    QuantumBlackConfig,
    QuantumBlackLLMClient,
)


def write_env(path: Path, content: str) -> Path:
    path.write_text(content, encoding="utf-8")
    return path


def test_config_reads_client_credentials(tmp_path: Path) -> None:
    env_path = write_env(
        tmp_path / ".env",
        "\n".join(
            [
                "QB_AZURE_ENDPOINT=https://gateway.example/test/",
                "QB_CLIENT_ID=test-client",
                "QB_CLIENT_SECRET=test-secret",
                "QB_MODEL=test-model",
            ]
        ),
    )

    config = QuantumBlackConfig.from_env(
        env_path=env_path,
        environ={},
    )

    assert config.endpoint == "https://gateway.example/test/"
    assert config.api_key == "test-client:test-secret"
    assert config.model == "test-model"


def test_environment_overrides_file(tmp_path: Path) -> None:
    env_path = write_env(
        tmp_path / ".env",
        "\n".join(
            [
                "QB_AZURE_ENDPOINT=https://file.example/",
                "QB_GATEWAY_TOKEN=file-token",
            ]
        ),
    )

    config = QuantumBlackConfig.from_env(
        env_path=env_path,
        environ={
            "QB_AZURE_ENDPOINT": "https://environment.example/",
            "QB_GATEWAY_TOKEN": "environment-token",
        },
    )

    assert config.endpoint == "https://environment.example/"
    assert config.api_key == "environment-token"


def test_missing_credential_is_rejected(tmp_path: Path) -> None:
    env_path = write_env(
        tmp_path / ".env",
        "QB_AZURE_ENDPOINT=https://gateway.example/",
    )

    with pytest.raises(
        LLMConfigurationError,
        match="No QuantumBlack gateway credential",
    ):
        QuantumBlackConfig.from_env(
            env_path=env_path,
            environ={},
        )


def test_completion_returns_normalised_response() -> None:
    fake_response = SimpleNamespace(
        model="test-model",
        choices=[
            SimpleNamespace(
                message=SimpleNamespace(
                    content="The answer is 42.",
                    refusal=None,
                ),
                finish_reason="stop",
            )
        ],
        usage=SimpleNamespace(
            prompt_tokens=10,
            completion_tokens=6,
        ),
    )

    fake_completions = SimpleNamespace(
        create=lambda **kwargs: fake_response
    )

    fake_sdk_client = SimpleNamespace(
        chat=SimpleNamespace(
            completions=fake_completions
        )
    )

    config = QuantumBlackConfig(
        endpoint="https://gateway.example/",
        api_version="test-version",
        model="test-model",
        api_key="test-key",
    )

    client = QuantumBlackLLMClient(
        config=config,
        sdk_client=fake_sdk_client,
    )

    result = client.complete(
        [{"role": "user", "content": "Test"}]
    )

    assert result.text == "The answer is 42."
    assert result.prompt_tokens == 10
    assert result.completion_tokens == 6

def test_streaming_completion_yields_text_deltas_and_closes() -> None:
    class FakeStream:
        def __init__(self) -> None:
            self.closed = False
            self.items = iter(
                [
                    SimpleNamespace(
                        choices=[
                            SimpleNamespace(
                                delta=SimpleNamespace(content="Momentum ")
                            )
                        ]
                    ),
                    SimpleNamespace(
                        choices=[
                            SimpleNamespace(
                                delta=SimpleNamespace(
                                    content="equals mass times velocity."
                                )
                            )
                        ]
                    ),
                ]
            )

        def __iter__(self):
            return self

        def __next__(self):
            return next(self.items)

        def close(self) -> None:
            self.closed = True

    stream = FakeStream()
    calls: list[dict[str, object]] = []

    def create(**kwargs):
        calls.append(kwargs)
        return stream

    fake_sdk_client = SimpleNamespace(
        chat=SimpleNamespace(
            completions=SimpleNamespace(create=create)
        )
    )
    client = QuantumBlackLLMClient(
        config=QuantumBlackConfig(
            endpoint="https://gateway.example/",
            api_version="test-version",
            model="test-model",
            api_key="test-key",
        ),
        sdk_client=fake_sdk_client,
    )

    async def collect() -> list[str]:
        return [
            delta
            async for delta in client.astream(
                [{"role": "user", "content": "Test"}],
                max_completion_tokens=50,
            )
        ]

    deltas = asyncio.run(collect())

    assert deltas == ["Momentum ", "equals mass times velocity."]
    assert calls[0]["stream"] is True
    assert stream.closed is True

