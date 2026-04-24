---
title:
  page: "NemoClaw Production Deployment Considerations"
  nav: "Production Considerations"
description:
  main: "Deployment topology, port reference, proxy and air-gap setup, China-network inference alternatives, and preflight checks for NemoClaw."
  agent: "Covers production deployment topology, port configuration, proxy and air-gap setup, China-network inference alternatives, multi-host patterns, and preflight checks. Use when planning a NemoClaw deployment on a remote host, behind a firewall, in a restricted network, or across multiple machines."
keywords: ["nemoclaw production deployment", "nemoclaw air-gap", "nemoclaw proxy", "nemoclaw firewall", "nemoclaw ports"]
topics: ["generative_ai", "ai_agents"]
tags: ["nemoclaw", "deployment", "networking", "openshell"]
content:
  type: reference
  difficulty: intermediate
  audience: ["developer", "engineer"]
status: published
---

<!--
  SPDX-FileCopyrightText: Copyright (c) 2025-2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
  SPDX-License-Identifier: Apache-2.0
-->

# Production Deployment Considerations

:::{admonition} Alpha software
NemoClaw is in alpha.
APIs, configuration schemas, and runtime behavior are subject to breaking changes between releases.
Review the [Release Notes](../about/release-notes.md) before deploying.
:::

This page covers deployment topology, port and egress reference, proxy and restricted-network setup, China-network guidance, and preflight steps for operators planning a managed NemoClaw deployment.

## Supported Deployment Path

The supported deployment path is:

1. Provision a Linux host that meets the [hardware and software requirements](#hardware-and-software-requirements).
2. Run the NemoClaw installer on that host.
3. Run `nemoclaw onboard` to create the gateway, configure inference, and apply security policies.

```console
$ curl -fsSL https://www.nvidia.com/nemoclaw.sh | bash
```

The installer launches the onboard wizard automatically.
For scripted or unattended deployments, see [Non-Interactive Onboarding](#non-interactive-onboarding).

For remote GPU instances, see [Deploy to a Remote GPU Instance](deploy-to-remote-gpu.md) for the Brev-specific walkthrough.

### Hardware and Software Requirements

For full hardware tables and container runtime compatibility, refer to [Quickstart — Prerequisites](../get-started/quickstart.md#prerequisites).

Key minimums for deployment planning:

| Resource     | Minimum    | Recommended |
|--------------|------------|-------------|
| CPU          | 4 vCPU     | 4+ vCPU     |
| RAM          | 8 GB       | 16 GB       |
| Disk         | 20 GB free | 40 GB free  |
| Node.js      | 22.16      |             |
| npm          | 10         |             |
| Linux kernel | 5.13+      | (for Landlock enforcement) |

The sandbox image is approximately 2.4 GB compressed.
On hosts with less than 8 GB of RAM, the image push can trigger the OOM killer.
Configure at least 8 GB of swap if you cannot add physical RAM.

### Non-Interactive Onboarding

To run onboarding without prompts, set environment variables before running the installer or `nemoclaw onboard`:

```console
$ export NEMOCLAW_NON_INTERACTIVE=1
$ export NVIDIA_API_KEY=<your-key>            # or another provider key
$ export NEMOCLAW_POLICY_TIER=balanced        # restricted | balanced | open
$ nemoclaw onboard --non-interactive --yes-i-accept-third-party-software
```

## Preflight Checks and Port Reference

`nemoclaw onboard` runs preflight checks automatically.
These checks verify port availability, available memory and swap, Docker connectivity, and OpenShell version compatibility.

Run these checks manually before onboarding to catch conflicts early:

```console
$ node --version          # must be 22.16 or later
$ docker info             # must show a running daemon
$ ls /sys/kernel/security/landlock   # kernel Landlock support
$ sudo lsof -i :8080
$ sudo lsof -i :18789
```

### Port Reference

All ports must be available on the host before onboarding.
Port values are baked into the sandbox image at build time; set overrides before running `nemoclaw onboard`.

| Port  | Purpose                       | Override variable           | Valid range  |
|-------|-------------------------------|-----------------------------|--------------|
| 8080  | OpenShell gateway proxy       | `NEMOCLAW_GATEWAY_PORT`     | 1024–65535   |
| 18789 | Sandbox dashboard (UI)        | `NEMOCLAW_DASHBOARD_PORT`   | 1024–65535   |
| 8000  | Local vLLM inference server   | `NEMOCLAW_VLLM_PORT`        | 1024–65535   |
| 11434 | Local Ollama inference server | `NEMOCLAW_OLLAMA_PORT`      | 1024–65535   |
| 11435 | Ollama token-gated auth proxy | `NEMOCLAW_OLLAMA_PROXY_PORT`| 1024–65535   |

To override a port:

```console
$ NEMOCLAW_DASHBOARD_PORT=19000 nemoclaw onboard
```

See [Running multiple sandboxes simultaneously](../reference/troubleshooting.md#running-multiple-sandboxes-simultaneously) for multi-sandbox port assignment.

### Baseline Egress Endpoints

The NemoClaw baseline network policy allows outbound access to the following endpoints on port 443.
All other egress is denied by default.

| Endpoint                   | Purpose                          |
|----------------------------|----------------------------------|
| `api.anthropic.com`        | Claude Code (agent binary)       |
| `statsig.anthropic.com`    | Claude Code feature flags        |
| `sentry.io`                | Error reporting (POST blocked)   |
| `integrate.api.nvidia.com` | NVIDIA inference API             |
| `inference-api.nvidia.com` | NVIDIA inference API             |
| `clawhub.ai`               | OpenClaw model registry          |
| `openclaw.ai`              | OpenClaw API                     |
| `docs.openclaw.ai`         | OpenClaw documentation           |
| `registry.npmjs.org`       | npm registry (GET only)          |

GitHub, Slack, HuggingFace, and similar endpoints are not in the baseline.
To allow additional endpoints, apply a policy preset after onboarding:

```console
$ nemoclaw <sandbox-name> policy-add
```

## Restricted-Network and Air-Gapped Deployments

Reduce or eliminate external egress by using a local inference provider.

### Local Inference Options

| Provider   | Egress after setup | Requirements                                               |
|------------|--------------------|------------------------------------------------------------|
| Local Ollama | None             | Ollama installed on the host; model pulled before onboard  |
| Local vLLM   | None             | vLLM server on `localhost:8000`; set `NEMOCLAW_EXPERIMENTAL=1` |
| Local NIM    | None             | NIM-capable GPU; set `NEMOCLAW_EXPERIMENTAL=1`             |

With local inference selected, the sandbox does not need to reach any external inference endpoint.
The baseline policy still permits egress to `openclaw.ai`, `clawhub.ai`, and `registry.npmjs.org`.
To minimize all egress, apply the `restricted` policy tier:

```console
$ export NEMOCLAW_POLICY_TIER=restricted
$ nemoclaw onboard
```

The `restricted` tier applies the baseline sandbox policy only, without any third-party preset access.

### Corporate Proxy Configuration

If your network routes internet traffic through a corporate proxy, set `NEMOCLAW_PROXY_HOST` and `NEMOCLAW_PROXY_PORT` before onboarding:

```console
$ export NEMOCLAW_PROXY_HOST=proxy.example.com
$ export NEMOCLAW_PROXY_PORT=8080
$ nemoclaw onboard
```

These values are baked into the sandbox image at build time.
The host accepts only alphanumeric characters, dots, hyphens, and colons.
The port must be numeric (0–65535).
Changing the proxy after onboarding requires re-running `nemoclaw onboard` to rebuild the image.

The default proxy address is `10.200.0.1:3128`, which corresponds to the OpenShell-injected gateway.
If your network does not provide direct routes to the baseline egress endpoints and no proxy is configured, inference calls and OpenClaw SDK requests fail inside the sandbox.

For more, see [Agent cannot reach external hosts through a proxy](../reference/troubleshooting.md#agent-cannot-reach-external-hosts-through-a-proxy).

## China-Network Considerations

NemoClaw does not include China-specific network support.
Several baseline egress endpoints — including `api.anthropic.com` and `integrate.api.nvidia.com` — are inaccessible or unreliable from mainland China networks.

The practical options for networks where these endpoints are blocked:

1. **Use local inference.**
   Select **Local Ollama**, **Local vLLM**, or **Local NIM** during onboarding.
   Local inference routes no traffic to external providers after the initial model pull.

2. **Use an OpenAI-compatible proxy or gateway.**
   Select **Other OpenAI-compatible endpoint** during onboarding and point it at a proxy or gateway that is reachable from your network.
   This includes self-hosted vLLM, llama.cpp, or OpenRouter-style gateways running locally or on accessible infrastructure.

3. **Use an Anthropic-compatible proxy or gateway.**
   Select **Other Anthropic-compatible endpoint** during onboarding and point it at a reachable Anthropic-compatible API proxy.

In all cases, if your network routes all outbound traffic through a proxy, set `NEMOCLAW_PROXY_HOST` and `NEMOCLAW_PROXY_PORT` before onboarding.
OpenClaw baseline service endpoints (`openclaw.ai`, `clawhub.ai`) may also be unreachable.
If those endpoints are blocked, the sandbox logs connection errors but continues to function for inference.

## Multi-Host Topology

NemoClaw runs one OpenShell gateway and one or more sandboxes per host.
There is no built-in multi-host orchestration or distributed gateway.

### Single Host, Multiple Sandboxes

Assign each sandbox a distinct dashboard port at onboard time:

```console
$ nemoclaw onboard                                    # first sandbox — port 18789
$ NEMOCLAW_DASHBOARD_PORT=19000 nemoclaw onboard      # second sandbox — port 19000
```

Each sandbox gets its own OpenClaw instance, inference configuration, and dashboard URL.

### Inference on a Separate GPU Host

If your inference GPU is on a separate machine, select **Other OpenAI-compatible endpoint** during onboarding and provide the address of your inference server.
NemoClaw configures the sandbox to route all inference traffic to that endpoint.

The blueprint profile `nim-local` expects a NIM service at `http://nim-service.local:8000`.
If NIM runs on a separate host, resolve `nim-service.local` in DNS or `/etc/hosts` before onboarding, or use the **Other OpenAI-compatible endpoint** option to specify the address directly.

### Remote Host Deployment

To run NemoClaw on a remote GPU instance, provision the VM and run the installer on that host.
For remote dashboard access, set `CHAT_UI_URL` to the browser-reachable origin before onboarding:

```console
$ export CHAT_UI_URL="https://<remote-host-origin>"
$ nemoclaw onboard
```

For the full walkthrough, see [Deploy to a Remote GPU Instance](deploy-to-remote-gpu.md).

## Related Topics

- [Deploy to a Remote GPU Instance](deploy-to-remote-gpu.md) — remote VM deployment and Brev compatibility.
- [Sandbox Hardening](sandbox-hardening.md) — container capability drops, process limits, and Landlock.
- [Security Best Practices](../security/best-practices.md) — network, filesystem, process, and inference controls.
- [Network Policies](../reference/network-policies.md) — egress control and policy preset reference.
- [Troubleshooting](../reference/troubleshooting.md) — common deployment and runtime errors.
