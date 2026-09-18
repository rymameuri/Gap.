from __future__ import annotations

import asyncio
import os
from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from openai import AzureOpenAI, OpenAIError


DEFAULT_ENV_PATH = Path(__file__).resolve().parents[3] / ".env"
DEFAULT_API_VERSION = "2024-04-01-preview"
DEFAULT_MODEL = "gpt-5.4-2026-03-05"


class LLMConfigurationError(RuntimeError):
    """Raised when the gateway configuration is missing or invalid."""


class LLMGatewayError(RuntimeError):
    """Raised when the gateway request or response fails."""


def _read_env_file(path: Path) -> dict[str, str]:
    if not path.is_file():
        return {}

    values: dict[str, str] = {}

    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()

        if not line or line.startswith("#") or "=" not in line:
            continue

        key, value = line.split("=", 1)
        values[key.strip()] = value.strip().strip("\"'")

    return values


@dataclass(frozen=True)
class QuantumBlackConfig:
    endpoint: str
    api_version: str
    model: str
    api_key: str = field(repr=False)

    @classmethod
    def from_env(
        cls,
        env_path: Path = DEFAULT_ENV_PATH,
        environ: Mapping[str, str] | None = None,
    ) -> "QuantumBlackConfig":
        file_values = _read_env_file(env_path)
        environment = os.environ if environ is None else environ

        def get_value(name: str) -> str | None:
            value = environment.get(name)

            if value is None or not value.strip():
                value = file_values.get(name)

            if value is None or not value.strip():
                return None

            return value.strip()

        endpoint = get_value("QB_AZURE_ENDPOINT")

        if not endpoint:
            raise LLMConfigurationError(
                "QB_AZURE_ENDPOINT is required."
            )

        if "YOUR_INSTANCE_ID" in endpoint:
            raise LLMConfigurationError(
                "Replace YOUR_INSTANCE_ID in the local .env file."
            )

        if not endpoint.startswith("https://"):
            raise LLMConfigurationError(
                "QB_AZURE_ENDPOINT must use HTTPS."
            )

        client_id = get_value("QB_CLIENT_ID")
        client_secret = get_value("QB_CLIENT_SECRET")

        if bool(client_id) != bool(client_secret):
            raise LLMConfigurationError(
                "QB_CLIENT_ID and QB_CLIENT_SECRET must be provided together."
            )

        if client_id and client_secret:
            credential = f"{client_id}:{client_secret}"
        else:
            credential = (
                get_value("AZURE_OPENAI_API_KEY")
                or get_value("QB_GATEWAY_TOKEN")
            )

        if not credential:
            raise LLMConfigurationError(
                "No QuantumBlack gateway credential was found."
            )

        return cls(
            endpoint=endpoint.rstrip("/") + "/",
            api_version=(
                get_value("QB_AZURE_API_VERSION")
                or DEFAULT_API_VERSION
            ),
            model=get_value("QB_MODEL") or DEFAULT_MODEL,
            api_key=credential,
        )


@dataclass(frozen=True)
class LLMTextResponse:
    text: str
    model: str | None
    finish_reason: str | None
    prompt_tokens: int | None
    completion_tokens: int | None


class QuantumBlackLLMClient:
    def __init__(
        self,
        config: QuantumBlackConfig | None = None,
        sdk_client: Any | None = None,
    ) -> None:
        self.config = config or QuantumBlackConfig.from_env()

        self._client = sdk_client or AzureOpenAI(
            azure_endpoint=self.config.endpoint,
            api_key=self.config.api_key,
            api_version=self.config.api_version,
        )

    def complete(
        self,
        messages: Sequence[Mapping[str, str]],
        max_completion_tokens: int = 1000,
    ) -> LLMTextResponse:
        if not messages:
            raise ValueError("At least one message is required.")

        if max_completion_tokens < 1:
            raise ValueError(
                "max_completion_tokens must be greater than zero."
            )

        try:
            response = self._client.chat.completions.create(
                model=self.config.model,
                messages=list(messages),
                max_completion_tokens=max_completion_tokens,
            )
        except OpenAIError as exc:
            raise LLMGatewayError(
                "The QuantumBlack gateway request failed."
            ) from exc

        if not response.choices:
            raise LLMGatewayError(
                "The gateway returned no completion choices."
            )

        choice = response.choices[0]
        content = choice.message.content

        if not content:
            refusal = getattr(choice.message, "refusal", None)

            if refusal:
                raise LLMGatewayError(
                    f"The model refused the request: {refusal}"
                )

            raise LLMGatewayError(
                "The gateway returned empty response content."
            )

        usage = response.usage

        return LLMTextResponse(
            text=content,
            model=getattr(response, "model", None),
            finish_reason=getattr(choice, "finish_reason", None),
            prompt_tokens=(
                getattr(usage, "prompt_tokens", None)
                if usage
                else None
            ),
            completion_tokens=(
                getattr(usage, "completion_tokens", None)
                if usage
                else None
            ),
        )

    async def acomplete(
        self,
        messages: Sequence[Mapping[str, str]],
        max_completion_tokens: int = 1000,
    ) -> LLMTextResponse:
        return await asyncio.to_thread(
            self.complete,
            messages=messages,
            max_completion_tokens=max_completion_tokens,
        )