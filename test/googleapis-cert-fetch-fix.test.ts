// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const PRELOAD = path.join(
  import.meta.dirname,
  "..",
  "nemoclaw-blueprint",
  "scripts",
  "googleapis-cert-fetch-fix.js",
);
const START_SCRIPT = path.join(import.meta.dirname, "..", "scripts", "nemoclaw-start.sh");

type FetchCall = { input: unknown; init: Record<string, unknown> | undefined };

function loadPreloadWith(recorder: (call: FetchCall) => unknown): typeof globalThis.fetch {
  delete require.cache[require.resolve(PRELOAD)];
  const stub = ((input: unknown, init?: Record<string, unknown>) => {
    recorder({ input, init });
    return Promise.resolve({ ok: true });
  }) as unknown as typeof globalThis.fetch;
  // biome-ignore lint/suspicious/noExplicitAny: test override of global fetch
  (globalThis as any).fetch = stub;
  require(PRELOAD);
  return globalThis.fetch;
}

describe("googleapis-cert-fetch-fix preload", () => {
  let originalFetch: typeof globalThis.fetch;
  let originalSandbox: string | undefined;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    originalSandbox = process.env.OPENSHELL_SANDBOX;
    process.env.OPENSHELL_SANDBOX = "1";
  });

  afterEach(() => {
    // biome-ignore lint/suspicious/noExplicitAny: restore global fetch
    (globalThis as any).fetch = originalFetch;
    if (originalSandbox === undefined) delete process.env.OPENSHELL_SANDBOX;
    else process.env.OPENSHELL_SANDBOX = originalSandbox;
    delete require.cache[require.resolve(PRELOAD)];
  });

  it("strips per-request dispatchers for Google signing-certificate endpoints", async () => {
    const calls: FetchCall[] = [];
    const fetch = loadPreloadWith((call) => calls.push(call));
    const dispatcher = { sentinel: true };

    await fetch(
      "https://www.googleapis.com/service_accounts/v1/metadata/x509/chat@system.gserviceaccount.com",
      // biome-ignore lint/suspicious/noExplicitAny: undici dispatcher option
      { dispatcher, headers: { accept: "application/json" } } as any,
    );

    expect(calls).toHaveLength(1);
    expect(calls[0].init).not.toHaveProperty("dispatcher");
    expect(calls[0].init).toMatchObject({ headers: { accept: "application/json" } });
  });

  it("strips per-request agents for Google oauth and robot cert paths", async () => {
    const calls: FetchCall[] = [];
    const fetch = loadPreloadWith((call) => calls.push(call));

    for (const url of [
      "https://www.googleapis.com/oauth2/v1/certs",
      "https://www.googleapis.com/oauth2/v3/certs",
      "https://www.googleapis.com/robot/v1/metadata/x509/foo%40bar",
    ]) {
      // biome-ignore lint/suspicious/noExplicitAny: non-standard agent option
      await fetch(url, { agent: { sentinel: true } } as any);
    }

    expect(calls).toHaveLength(3);
    for (const call of calls) {
      expect(call.init).not.toHaveProperty("agent");
    }
  });

  it("leaves unrelated requests untouched", async () => {
    const calls: FetchCall[] = [];
    const fetch = loadPreloadWith((call) => calls.push(call));
    const dispatcher = { sentinel: true };

    // biome-ignore lint/suspicious/noExplicitAny: undici dispatcher option
    await fetch("https://example.com/oauth2/v1/certs", { dispatcher } as any);
    // biome-ignore lint/suspicious/noExplicitAny: undici dispatcher option
    await fetch("https://www.googleapis.com/storage/v1/b/bucket", { dispatcher } as any);

    expect(calls).toHaveLength(2);
    expect(calls[0].init).toHaveProperty("dispatcher", dispatcher);
    expect(calls[1].init).toHaveProperty("dispatcher", dispatcher);
  });

  it("does not wrap fetch outside the sandbox", () => {
    process.env.OPENSHELL_SANDBOX = "0";

    const fetch = loadPreloadWith(() => undefined);

    // biome-ignore lint/suspicious/noExplicitAny: preload marks wrapped functions
    expect((fetch as any).__nemoclawGoogleapisCertFetchFix).toBeUndefined();
  });

  it("entrypoint emits the preload and registers it in NODE_OPTIONS", () => {
    const startScript = fs.readFileSync(START_SCRIPT, "utf-8");
    const start = startScript.indexOf(
      '_GOOGLEAPIS_CERT_FIX_SCRIPT="/tmp/nemoclaw-googleapis-cert-fetch-fix.js"',
    );
    const end = startScript.indexOf("# WebSocket CONNECT tunnel fix", start);
    if (start === -1 || end === -1 || end <= start) {
      throw new Error("Expected Google cert fix entrypoint block in scripts/nemoclaw-start.sh");
    }

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "nemoclaw-googleapis-cert-fetch-fix-"));
    const fixPath = path.join(tempDir, "googleapis-cert-fetch-fix.js");
    const block = startScript
      .slice(start, end)
      .replace(
        '_GOOGLEAPIS_CERT_FIX_SCRIPT="/tmp/nemoclaw-googleapis-cert-fetch-fix.js"',
        `_GOOGLEAPIS_CERT_FIX_SCRIPT=${JSON.stringify(fixPath)}`,
      )
      .replace(
        '_GOOGLEAPIS_CERT_FIX_SOURCE="/usr/local/lib/nemoclaw/preloads/googleapis-cert-fetch-fix.js"',
        `_GOOGLEAPIS_CERT_FIX_SOURCE=${JSON.stringify(PRELOAD)}`,
      );
    const wrapper = [
      "#!/usr/bin/env bash",
      "set -euo pipefail",
      "emit_sandbox_sourced_file() { local target=\"$1\"; cat > \"$target\"; chmod 444 \"$target\"; }",
      "NODE_OPTIONS='--require /already-loaded.js'",
      block,
      "printf 'NODE_OPTIONS=%s\\n' \"$NODE_OPTIONS\"",
      "printf 'SCRIPT=%s\\n' \"$_GOOGLEAPIS_CERT_FIX_SCRIPT\"",
    ].join("\n");
    const wrapperPath = path.join(tempDir, "run.sh");

    try {
      fs.writeFileSync(wrapperPath, wrapper, { mode: 0o700 });
      const result = spawnSync("bash", [wrapperPath], { encoding: "utf-8", timeout: 5000 });
      expect(result.status).toBe(0);
      expect(result.stdout).toContain(`SCRIPT=${fixPath}`);
      expect(result.stdout).toContain("--require /already-loaded.js");
      expect(result.stdout).toContain(`--require ${fixPath}`);
      expect((fs.statSync(fixPath).mode & 0o777).toString(8)).toBe("444");
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
