---
title:
  page: "NemoClaw Release Notes"
  nav: "Release Notes"
description:
  main: "Changelog and feature history for NemoClaw releases."
  agent: "Includes the NemoClaw release notes. Use when users ask about recent changes, the release cadence, or where to track versioned assets on GitHub."
keywords: ["nemoclaw release notes", "nemoclaw changelog"]
topics: ["generative_ai", "ai_agents"]
tags: ["nemoclaw", "releases"]
content:
  type: reference
  difficulty: technical_beginner
  audience: ["developer", "engineer"]
status: published
---

<!--
  SPDX-FileCopyrightText: Copyright (c) 2025-2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
  SPDX-License-Identifier: Apache-2.0
-->

# Release Notes

NVIDIA NemoClaw is available in early preview starting March 16, 2026. Use the following GitHub resources to track changes.

| Resource | Description |
|---|---|
| [Releases](https://github.com/NVIDIA/NemoClaw/releases) | Versioned release notes and downloadable assets. |
| [Release comparison](https://github.com/NVIDIA/NemoClaw/compare) | Diff between any two tags or branches. |
| [Merged pull requests](https://github.com/NVIDIA/NemoClaw/pulls?q=is%3Apr+is%3Amerged) | Individual changes with review discussion. |
| [Commit history](https://github.com/NVIDIA/NemoClaw/commits/main) | Full commit log on `main`. |

## Bundled OpenClaw version

NemoClaw sandbox images use a build-time OpenClaw pin rather than updating OpenClaw automatically at sandbox start. The current OpenClaw agent manifest pins `expected_version: "2026.4.9"`, and the blueprint compatibility metadata requires at least OpenClaw `2026.4.9`.

To check existing sandboxes against the version bundled with this NemoClaw release, run:

```console
$ nemoclaw upgrade-sandboxes --check
```

The check compares each sandbox's cached or live OpenClaw version with the manifest pin and reports stale sandboxes. `nemoclaw <name> status` and `nemoclaw <name> connect` also print a rebuild hint when a sandbox is running an outdated agent version.

To rebuild a stale sandbox while preserving supported state, use:

```console
$ nemoclaw <name> rebuild
```
