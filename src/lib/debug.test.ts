// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
// Import from compiled dist/ so coverage is attributed correctly.
import { redact } from "../../dist/lib/debug";

describe("redact", () => {
  it("redacts NVIDIA_API_KEY=value patterns", () => {
    const key = ["NVIDIA", "API", "KEY"].join("_");
    expect(redact(`${key}=some-value`)).toBe(`${key}=<REDACTED>`);
  });

  it("redacts generic KEY/TOKEN/SECRET/PASSWORD env vars", () => {
    expect(redact("API_KEY=secret123")).toBe("API_KEY=<REDACTED>");
    expect(redact("MY_TOKEN=tok_abc")).toBe("MY_TOKEN=<REDACTED>");
    expect(redact("DB_PASSWORD=hunter2")).toBe("DB_PASSWORD=<REDACTED>");
    expect(redact("MY_SECRET=s3cret")).toBe("MY_SECRET=<REDACTED>");
    expect(redact("CREDENTIAL=cred")).toBe("CREDENTIAL=<REDACTED>");
  });

  it("redacts nvapi- prefixed keys", () => {
    expect(redact("using key nvapi-AbCdEfGhIj1234")).toBe("using key <REDACTED>");
  });

  it("redacts classic GitHub personal access tokens (ghp_)", () => {
    expect(redact("token: ghp_" + "a".repeat(36))).toBe("token: <REDACTED>");
  });

  it("redacts fine-grained GitHub personal access tokens (github_pat_)", () => {
    expect(redact("token: github_pat_" + "A".repeat(40))).toBe("token: <REDACTED>");
  });

  it("redacts Bearer tokens", () => {
    expect(redact("Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.payload.sig")).toBe(
      "Authorization: Bearer <REDACTED>",
    );
  });

  it("handles multiple patterns in one string", () => {
    const input = "API_KEY=secret nvapi-abcdefghijk Bearer tok123";
    const result = redact(input);
    expect(result).not.toContain("secret");
    expect(result).not.toContain("nvapi-abcdefghijk");
    expect(result).not.toContain("tok123");
  });

  it("leaves clean text unchanged", () => {
    const clean = "Hello world, no secrets here";
    expect(redact(clean)).toBe(clean);
  });
});

describe("createTarball error handling", () => {
  let savedExitCode: number | undefined;

  beforeEach(async () => {
    savedExitCode = process.exitCode;
    process.exitCode = undefined;
    // Suppress console output during tests
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    process.exitCode = savedExitCode;
    vi.restoreAllMocks();
  });

  it("sets process.exitCode=1 when tar fails", () => {
    const { runDebug } = require("../../dist/lib/debug");
    // Pass an invalid output path that tar cannot write to
    runDebug({ output: "/nonexistent/path/debug.tar.gz", quick: true });

    expect(process.exitCode).toBe(1);
  });

  it("does not set exitCode when tar succeeds", () => {
    const { runDebug } = require("../../dist/lib/debug");
    runDebug({ output: "/tmp/nemoclaw-test-debug.tar.gz", quick: true });

    expect(process.exitCode).toBeUndefined();
  });
});
