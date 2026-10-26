// Guard the dependency direction without adding a framework or runtime dependency.
import { readFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { applicationFiles, assetManifest } from "./sync-assets.mjs";

export async function checkArchitecture(root = process.cwd()) {
  const files = await applicationFiles(join(root, "src"));
  const core = join(root, "src/core"),
    application = join(root, "src/application");
  const inside = (file, directory) => file.startsWith(directory + sep);
  for (const file of files) {
    const isCore = inside(file, core),
      isApplication = inside(file, application);
    if (!isCore && !isApplication) continue;
    const source = await readFile(file, "utf8");
    for (const [, specifier] of source.matchAll(
      /\b(?:from\s*|import\s*(?:\(\s*)?)['"]([^'"]+)['"]/g,
    )) {
      const dependency = resolve(dirname(file), specifier);
      if (
        !specifier.startsWith(".") ||
        !(
          inside(dependency, core) ||
          (isApplication && inside(dependency, application))
        )
      ) {
        throw new Error(
          `Dependency boundary violated: ${file} imports ${specifier}`,
        );
      }
    }
    if (
      /\b(?:document|window|navigator|performance)\s*\.|\b(?:requestAnimationFrame|cancelAnimationFrame)\s*\(/.test(
        source,
      )
    ) {
      throw new Error(`Browser API leaked into an inner layer: ${file}`);
    }
  }
  const html = await readFile(join(root, "index.html"), "utf8");
  const manifest = await assetManifest(root);
  const imports = JSON.parse(
    html.match(/<script type="importmap">([\s\S]*?)<\/script>/)[1],
  ).imports;
  for (const [key, value] of Object.entries(manifest.imports)) {
    if (imports[key] !== value)
      throw new Error(`Stale browser module ${key}; run npm run assets`);
  }
  if (
    !html.includes(`content="${manifest.build}"`) ||
    !html.includes(`./style.css?v=${manifest.build}`) ||
    !html.includes(`./src/main.js?v=${manifest.build}`)
  )
    throw new Error("Stale entry assets; run npm run assets");
  return { files: files.length, build: manifest.build };
}
