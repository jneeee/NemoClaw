---
title:
  page: "Tool-Calling Reliability with Local Inference"
  nav: "Tool-Calling Reliability"
description:
  main: "Diagnose local-inference tool-call leaks and choose Ollama or vLLM for reliable NemoClaw agents."
  agent: "Explains when Ollama is sufficient for NemoClaw local inference, when vLLM tool-call parsing is required, and how to repoint a sandbox to a vLLM endpoint."
keywords: ["nemoclaw tool calling", "ollama tool calls", "vllm tool call parser", "local inference reliability"]
topics: ["generative_ai", "ai_agents"]
tags: ["openclaw", "openshell", "inference_routing", "local_inference", "tool_calling"]
content:
  type: how_to
  difficulty: intermediate
  audience: ["developer", "engineer"]
status: published
---

<!--
  SPDX-FileCopyrightText: Copyright (c) 2025-2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
  SPDX-License-Identifier: Apache-2.0
-->

# Tool-Calling Reliability with Local Inference

Local inference works best when the server returns tool calls in the structured
format that OpenClaw expects. Some local backends can generate the right tokens
but fail to convert them into a structured `tool_calls` field. When that
happens, the assistant message appears as plain text that looks like JSON:

```json
{"name":"memory_search","arguments":{"query":"robotics"}}
```

The sandbox is still healthy, and simple text prompts can still work, but tools
are not dispatched. Use this page to decide whether Ollama is enough for your
agent, or whether you should run an OpenAI-compatible vLLM server with explicit
tool-call parsing.

## Choose the Right Local Backend

Ollama is the easiest local-inference path and is a good fit for:

- simple chat or single-tool experiments;
- embeddings-only or retrieval helper flows;
- low-complexity prompts with a small tool surface;
- quick model checks during onboarding.

Use vLLM with auto tool choice when your agent depends on reliable tool dispatch,
especially for:

- agents with four or more tools enabled;
- long system prompts or large sender-metadata preambles;
- multi-turn agent loops that must call tools and continue from tool results;
- production or unattended sandboxes where a raw JSON reply would look like a
  successful answer but skip the requested action.

For Hermes-family models, start vLLM with `--enable-auto-tool-choice` and the
matching parser, for example `--tool-call-parser hermes`.

## Start a vLLM Server with Tool Parsing

The following compose file is a starting point for a local GPU workstation. Tune
paths, memory utilization, and model length for your hardware.

```yaml
services:
  vllm-nemoclaw:
    image: vllm/vllm-openai:latest
    container_name: vllm-nemoclaw
    restart: unless-stopped
    ports:
      - "8002:8000"
    volumes:
      - /mnt/models/vllm:/models:ro
      - /mnt/models/hf-cache:/root/.cache/huggingface
    ipc: host
    deploy:
      resources:
        reservations:
          devices:
            - capabilities: [gpu]
              count: all
    command: >
      --model /models/Hermes-3-Llama-3.1-8B
      --served-model-name hermes-3-llama-3.1-8b
      --enable-auto-tool-choice
      --tool-call-parser hermes
      --gpu-memory-utilization 0.20
      --max-model-len 32768
      --api-key ${VLLM_API_KEY}
```

After the server is running, confirm that it exposes the model on the host:

```console
$ curl -H "Authorization: Bearer ${VLLM_API_KEY}" http://localhost:8002/v1/models
```

## Repoint an Existing Sandbox

If your sandbox is already onboarded and you only need to change the model
endpoint, connect to the sandbox and patch OpenClaw configuration with a batch
file.

Create `vllm-config.json` inside the sandbox:

```json
{
  "models": {
    "providers": {
      "vllm-local": {
        "baseUrl": "http://host.openshell.internal:8002/v1",
        "apiKey": "${VLLM_API_KEY}",
        "api": "openai-completions",
        "models": [
          {
            "id": "hermes-3-llama-3.1-8b",
            "name": "Hermes 3 Llama 3.1 8B",
            "contextWindow": 32768,
            "maxTokens": 4096
          }
        ]
      }
    }
  },
  "agents": {
    "defaults": {
      "model": {
        "primary": "vllm-local/hermes-3-llama-3.1-8b"
      }
    }
  }
}
```

Apply it from the sandbox shell:

```console
$ openclaw config set --batch-file vllm-config.json
$ openclaw gateway restart
```

Use the `openai-completions` API path for vLLM tool-calling models. NemoClaw's
vLLM onboarding path also forces chat completions because the Responses API path
can bypass the vLLM tool-call parser.

## Verify Tool Dispatch

After switching providers, run a prompt that should require a tool. For example,
ask the agent to search memory or send a session message. A reliable setup should
show a normal assistant response after the tool result, not a literal JSON object
with `name` and `arguments` in the visible text.

If raw JSON still appears:

1. Confirm vLLM was started with `--enable-auto-tool-choice`.
2. Confirm the parser matches the model family, such as `--tool-call-parser hermes`.
3. Confirm OpenClaw is using the vLLM model ID with `openclaw config get`.
4. Restart the gateway after applying config changes.

## Related Topics

- [Use a Local Inference Server](use-local-inference.md) for onboarding paths.
- [Switch Inference Models](switch-inference-providers.md) for runtime model changes.
- [Monitor Sandbox Activity](../monitoring/monitor-sandbox-activity.md) for status and log checks.
