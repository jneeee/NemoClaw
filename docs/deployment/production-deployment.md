---
title:
  page: "Production Deployment Planning"
  nav: "Production Deployment"
description:
  main: "Planning checklist for production NemoClaw deployments in restricted networks, air-gapped environments, China networks, and multi-host topologies."
  agent: "Provides production deployment planning guidance for NemoClaw, including restricted-network prerequisites, air-gapped staging, China network considerations, and multi-host connectivity checks. Use when preparing NemoClaw for enterprise or production-like environments."
keywords: ["nemoclaw production deployment", "air gapped deployment", "restricted network", "multi host topology", "china network"]
topics: ["generative_ai", "ai_agents"]
tags: ["nemoclaw", "deployment", "production", "air-gapped", "networking"]
content:
  type: howto
  difficulty: technical_intermediate
  audience: ["developer", "engineer", "administrator"]
status: published
---

<!--
  SPDX-FileCopyrightText: Copyright (c) 2025-2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
  SPDX-License-Identifier: Apache-2.0
-->

# Production Deployment Planning

NemoClaw is an alpha reference stack. For production or production-like pilots,
plan the environment before running `nemoclaw onboard`. The checklist below is
intended for enterprise deployments where the host may be air-gapped, internet
access may be allow-listed, or the NemoClaw CLI, OpenShell gateway, and OpenClaw
agent may run across multiple hosts or namespaces.

## Deployment Boundaries

Use this guide to plan supported NemoClaw operations:

- installing and updating the NemoClaw CLI from an approved source,
- building or pulling the sandbox and support images,
- running OpenShell-managed sandboxes on an approved Docker or K3s host,
- connecting the sandbox to an approved inference endpoint, and
- applying explicit network policy presets or custom policy additions.

This guide does not replace your site security review. In restricted
environments, validate every downloaded artifact, image, model, and endpoint
against your organization policies before exposing them to users.

## Preflight Checklist

Before deploying, record these decisions:

| Area | Decision to make |
| --- | --- |
| Host runtime | Which Linux host runs Docker or K3s, and who operates it? |
| Images | Which registry stores NemoClaw, OpenShell, OpenClaw, and base images? |
| Inference | Which endpoint is approved: local Ollama, an OpenAI-compatible service, or a managed provider? |
| Secrets | Where are API keys and tokens stored, rotated, and audited? |
| Network policy | Which domains, ports, binaries, and methods are permitted from the sandbox? |
| Upgrade path | How are CLI releases, sandbox images, and model artifacts promoted between environments? |
| Logs | Where are OpenShell, OpenClaw, and NemoClaw logs retained? |

Run the standard quickstart first in a disposable development environment. Then
promote the same versions and configuration into staging before attempting a
restricted production host.

## Air-Gapped or Restricted Networks

For fully air-gapped sites, stage everything in a connected build environment
and import only approved artifacts:

1. Mirror required container images into an internal registry.
2. Mirror Node.js packages, Python packages, and any model artifacts required by
   your selected inference path.
3. Save the exact NemoClaw release or source commit used for the CLI install.
4. Capture image digests and package lockfiles as promotion evidence.
5. Configure the sandbox network policy with only the internal registry,
   inference endpoints, messaging endpoints, and observability endpoints needed
   for the deployment.
6. Test a clean install from the internal mirrors before moving to the isolated
   environment.

For partially restricted networks, prefer allow-listing hostnames used by your
chosen path rather than opening broad outbound access. If a command fails, check
whether it is fetching an installer, image, package, model, or provider API and
mirror or allow-list only that dependency.

## China Network Considerations

Mainland China deployments often encounter blocked, slow, or inspected outbound
connections. Plan for an internal mirror strategy rather than relying on public
internet reachability at runtime:

- Mirror container images and package registries close to the deployment site.
- Prefer a local or regional inference endpoint reachable from the sandbox host.
- Validate messaging integrations and webhook destinations from the production
  network before onboarding users.
- Keep network policy presets explicit. If a preset allows a public endpoint that
  is unavailable in your region, replace it with a custom policy that targets
  the internal mirror or gateway.
- Document fallback procedures for DNS, proxy, and certificate issues so the
  operations team can distinguish a NemoClaw failure from a network path failure.

## Multi-Host Topology

In single-host development, the CLI, OpenShell gateway, OpenClaw gateway, and
inference endpoint often share one machine. Production deployments may split
these roles:

```text
Operator workstation
  └─ NemoClaw CLI
       └─ OpenShell gateway / sandbox runtime host
            ├─ OpenClaw agent in sandbox
            ├─ optional local inference service
            └─ approved external or internal services
```

For multi-host deployments, verify connectivity in both directions before
onboarding:

| From | To | What to verify |
| --- | --- | --- |
| Operator workstation | OpenShell host | SSH or management access required by your operating model |
| OpenShell host | Container registry | Pull access to all approved image digests |
| Sandbox | Inference endpoint | Hostname, port, protocol, and auth token expected by the provider |
| Sandbox | Messaging/webhook services | Only the domains and methods required by enabled integrations |
| Operations network | Logs and metrics | Access to the logs needed for incident response |

When the inference server runs on the same host as Docker, prefer the
`host.openshell.internal` host-gateway alias where NemoClaw documents it. For
remote inference, use a stable DNS name and add a matching network policy entry
rather than relying on ephemeral host IP addresses.

## Connectivity Checks

Before declaring the deployment ready:

1. Confirm `nemoclaw --version` matches the promoted release.
2. Confirm the OpenShell runtime version is the expected one for the NemoClaw
   release.
3. Pull or load all required images by digest on the runtime host.
4. Start the selected inference service and verify it responds from the runtime
   host.
5. Apply the network policy preset or custom policy, then test from inside the
   sandbox that only expected endpoints are reachable.
6. Exercise one agent request end to end and verify logs capture enough detail
   for troubleshooting without exposing secrets.

## Operations Notes

- Treat network policy changes like code: review, version, and promote them
  through staging.
- Keep a documented rebuild procedure for refreshing a sandbox after changing
  images, policies, or inference endpoints.
- Rotate credentials with the NemoClaw credential and config flows instead of
  editing sandbox files by hand.
- For regulated environments, retain the promoted artifact list with image
  digests, release versions, and lockfiles.

## Related Guides

- [Deploy to a Remote GPU Instance](deploy-to-remote-gpu.md)
- [Use Local Inference](../inference/use-local-inference.md)
- [Customize the Network Policy](../network-policy/customize-network-policy.md)
- [Sandbox Image Hardening](sandbox-hardening.md)
