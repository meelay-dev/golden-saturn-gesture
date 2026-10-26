// Negative fixtures prove that boundary and asset guards reject real regression cases.
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { syncAssets } from "../tools/sync-assets.mjs";
import { checkArchitecture } from "../tools/check-architecture.mjs";

async function fixture(run) {
  const root = await mkdtemp(join(tmpdir(), "saturn-architecture-"));
  try {
    await mkdir(join(root, "src/core"), { recursive: true });
    await writeFile(
      join(root, "src/core/rule.js"),
      "export const threshold = 0.38;",
    );
    await writeFile(
      join(root, "src/main.js"),
      'import { threshold } from "./core/rule.js";',
    );
    await writeFile(join(root, "style.css"), "body { margin: 0; }");
    await writeFile(join(root, "package.json"), '{"version":"1.0.0"}');
    await writeFile(
      join(root, "index.html"),
      '<meta name="app-build" content="old"><script type="importmap">{"imports":{"three":"https://example.com/three.js"}}</script><script type="module" src="./src/main.js?v=old"></script>',
    );
    await syncAssets(root);
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("domain imports cannot depend on a renderer", () =>
  fixture(async (root) => {
    await writeFile(
      join(root, "src/core/rule.js"),
      'import { Renderer } from "../render/renderer.js";',
    );
    await assert.rejects(
      checkArchitecture(root),
      /Dependency boundary violated/,
    );
  }));
test("application policies cannot reach directly into browser APIs", () =>
  fixture(async (root) => {
    await mkdir(join(root, "src/application"));
    await writeFile(
      join(root, "src/application/session.js"),
      "export const camera = navigator.mediaDevices;",
    );
    await assert.rejects(checkArchitecture(root), /Browser API leaked/);
  }));
test("asset synchronization is deterministic and detects newly added modules", () =>
  fixture(async (root) => {
    const before = await readFile(join(root, "index.html"), "utf8");
    const first = await syncAssets(root);
    assert.equal(await readFile(join(root, "index.html"), "utf8"), before);
    await writeFile(
      join(root, "src/core/new-rule.js"),
      "export const limit = 2.2;",
    );
    await assert.rejects(checkArchitecture(root), /Stale browser module/);
    const next = await syncAssets(root);
    assert.notEqual(next.build, first.build);
    assert.ok(
      next.imports["./src/core/new-rule.js"].endsWith(`?v=${next.build}`),
    );
    await checkArchitecture(root);
  }));
