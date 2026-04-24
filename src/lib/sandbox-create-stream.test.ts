// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { EventEmitter } from "node:events";

import { afterEach, describe, expect, it, vi } from "vitest";

import { streamSandboxCreate } from "./sandbox-create-stream";

class FakeReadable extends EventEmitter {
  destroy() {}
}

class FakeChild extends EventEmitter {
  stdout = new FakeReadable();
  stderr = new FakeReadable();
  kill = vi.fn();
  unref = vi.fn();
}

describe("sandbox-create-stream", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("prints the initial build banner immediately", async () => {
    const child = new FakeChild();
    const logLine = vi.fn();
    const promise = streamSandboxCreate("echo create", process.env, {
      logLine,
      spawnImpl: () => child as never,
    });

    expect(logLine).toHaveBeenCalledWith("  Building sandbox image...");
    child.emit("close", 0);
    await promise;
  });

  it("streams visible progress lines and returns the collected output", async () => {
    const child = new FakeChild();
    const logLine = vi.fn();
    const promise = streamSandboxCreate("echo create", process.env, {
      logLine,
      spawnImpl: () => child as never,
      heartbeatIntervalMs: 1_000,
      silentPhaseMs: 10_000,
    });

    child.stdout.emit(
      "data",
      Buffer.from("  Building image sandbox\n  Pushing image layers\nCreated sandbox: demo\n✓ Ready\n"),
    );
    child.emit("close", 0);

    await expect(promise).resolves.toMatchObject({
      status: 0,
      sawProgress: true,
      output: expect.stringContaining("Created sandbox: demo"),
    });
    expect(logLine).toHaveBeenCalledWith("  Building image sandbox");
    expect(logLine).toHaveBeenCalledWith("  Pushing image layers");
    expect(logLine).toHaveBeenCalledWith("Created sandbox: demo");
  });

  it("forces success when the sandbox becomes ready before the stream exits", async () => {
    vi.useFakeTimers();

    const child = new FakeChild();
    let checks = 0;
    const promise = streamSandboxCreate("echo create", process.env, {
      spawnImpl: () => child as never,
      readyCheck: () => {
        checks += 1;
        return checks >= 2;
      },
      pollIntervalMs: 5,
      heartbeatIntervalMs: 1_000,
      silentPhaseMs: 10_000,
      logLine: vi.fn(),
    });

    child.stdout.emit("data", Buffer.from("  Building image sandbox\n"));
    await vi.advanceTimersByTimeAsync(12);

    await expect(promise).resolves.toMatchObject({
      status: 0,
      sawProgress: true,
      forcedReady: true,
      output: expect.stringContaining("Sandbox reported Ready before create stream exited"),
    });
    expect(child.kill).toHaveBeenCalledWith("SIGTERM");
    expect(child.unref).toHaveBeenCalled();
  });

  it("flushes the final partial line before resolving", async () => {
    const child = new FakeChild();
    const promise = streamSandboxCreate("echo create", process.env, {
      spawnImpl: () => child as never,
      logLine: vi.fn(),
    });

    child.stdout.emit("data", Buffer.from("Created sandbox: demo"));
    child.emit("close", 0);

    await expect(promise).resolves.toMatchObject({
      status: 0,
      output: "Created sandbox: demo",
      sawProgress: true,
    });
  });

  it("recovers when sandbox is ready at the moment the stream exits non-zero", async () => {
    const child = new FakeChild();
    const logLine = vi.fn();
    const promise = streamSandboxCreate("echo create", process.env, {
      spawnImpl: () => child as never,
      readyCheck: () => true, // sandbox is already Ready
      pollIntervalMs: 60_000, // large interval so the poll doesn't fire first
      heartbeatIntervalMs: 1_000,
      silentPhaseMs: 10_000,
      logLine,
    });

    child.stdout.emit("data", Buffer.from("Created sandbox: demo\n"));
    // SSH 255 — stream exits non-zero after sandbox was created
    child.emit("close", 255);

    await expect(promise).resolves.toMatchObject({
      status: 0,
      forcedReady: true,
      sawProgress: true,
    });
  });

  it("returns non-zero when readyCheck is false at close time", async () => {
    const child = new FakeChild();
    const promise = streamSandboxCreate("echo create", process.env, {
      spawnImpl: () => child as never,
      readyCheck: () => false, // sandbox is NOT ready
      pollIntervalMs: 60_000,
      heartbeatIntervalMs: 1_000,
      silentPhaseMs: 10_000,
      logLine: vi.fn(),
    });

    child.stdout.emit("data", Buffer.from("Created sandbox: demo\n"));
    child.emit("close", 255);

    await expect(promise).resolves.toMatchObject({
      status: 255,
      sawProgress: true,
    });
    expect((await promise).forcedReady).toBeUndefined();
  });

  it("recognizes BuildKit step-header lines and triggers build phase", async () => {
    const child = new FakeChild();
    const logLine = vi.fn();
    const promise = streamSandboxCreate("echo create", process.env, {
      logLine,
      spawnImpl: () => child as never,
      heartbeatIntervalMs: 1_000,
      silentPhaseMs: 10_000,
    });

    child.stdout.emit(
      "data",
      Buffer.from(
        "#1 [internal] load build definition from Dockerfile\n" +
          "#2 [1/3] FROM ghcr.io/example/base\n",
      ),
    );
    child.emit("close", 0);

    const result = await promise;
    expect(result.sawProgress).toBe(true);
    expect(logLine).toHaveBeenCalledWith("#1 [internal] load build definition from Dockerfile");
    expect(logLine).toHaveBeenCalledWith("#2 [1/3] FROM ghcr.io/example/base");
  });

  it("shows BuildKit DONE and CACHED lines as progress", async () => {
    const child = new FakeChild();
    const logLine = vi.fn();
    const promise = streamSandboxCreate("echo create", process.env, {
      logLine,
      spawnImpl: () => child as never,
      heartbeatIntervalMs: 1_000,
      silentPhaseMs: 10_000,
    });

    child.stdout.emit(
      "data",
      Buffer.from("#7 DONE 0.2s\n#8 CACHED\n"),
    );
    child.emit("close", 0);

    const result = await promise;
    expect(result.sawProgress).toBe(true);
    expect(logLine).toHaveBeenCalledWith("#7 DONE 0.2s");
    expect(logLine).toHaveBeenCalledWith("#8 CACHED");
  });

  it("handles mixed BuildKit and legacy builder output without confusing phases", async () => {
    const child = new FakeChild();
    const logLine = vi.fn();
    const promise = streamSandboxCreate("echo create", process.env, {
      logLine,
      spawnImpl: () => child as never,
      heartbeatIntervalMs: 1_000,
      silentPhaseMs: 10_000,
    });

    child.stdout.emit(
      "data",
      Buffer.from(
        "#1 [internal] load build definition from Dockerfile\n" +
          "#2 [2/3] RUN apt-get update\n" +
          "#3 DONE 1.4s\n" +
          "#4 CACHED\n" +
          "  Pushing image sandbox:latest\n" +
          "Created sandbox: mixed\n",
      ),
    );
    child.emit("close", 0);

    const result = await promise;
    expect(result.sawProgress).toBe(true);
    expect(result.output).toContain("Created sandbox: mixed");
    expect(logLine).toHaveBeenCalledWith("#1 [internal] load build definition from Dockerfile");
    expect(logLine).toHaveBeenCalledWith("#3 DONE 1.4s");
    expect(logLine).toHaveBeenCalledWith("#4 CACHED");
    expect(logLine).toHaveBeenCalledWith("  Pushing image sandbox:latest");
    expect(logLine).toHaveBeenCalledWith("Created sandbox: mixed");
  });

  it("reports spawn errors cleanly", async () => {
    const child = new FakeChild();
    const promise = streamSandboxCreate("echo create", process.env, {
      spawnImpl: () => child as never,
      logLine: vi.fn(),
    });

    child.emit("error", Object.assign(new Error("ENOENT"), { code: "ENOENT" }));

    await expect(promise).resolves.toEqual({
      status: 1,
      output: "spawn failed: ENOENT (ENOENT)",
      sawProgress: false,
    });
  });
});
