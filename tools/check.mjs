import { readdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { checkArchitecture } from "./check-architecture.mjs";
async function walk(path) {
  const files = await readdir(path, { withFileTypes: true });
  for (const file of files) {
    const name = `${path}/${file.name}`;
    if (file.isDirectory()) await walk(name);
    else if (/\.m?js$/.test(name)) {
      const result = spawnSync(process.execPath, ["--check", name], {
        stdio: "inherit",
      });
      if (result.status !== 0) process.exit(result.status || 1);
      console.log(`Syntax OK: ${name}`);
    }
  }
}
for (const path of ["src", "tests", "tools"]) await walk(path);
const result = await checkArchitecture();
console.log(
  `Architecture and browser assets OK: ${result.files} modules, ${result.build}`,
);
