import { access, cp, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const standaloneRoot = join(projectRoot, ".next", "standalone");
const serverPath = join(standaloneRoot, "server.js");

async function copyDirectoryIfPresent(source, destination) {
  try {
    await access(source);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return;
    throw error;
  }

  await mkdir(dirname(destination), { recursive: true });
  await cp(source, destination, { recursive: true, force: true });
}

try {
  await access(serverPath);
} catch {
  throw new Error("Missing standalone build. Run `npm run build` before starting the dashboard.");
}

await copyDirectoryIfPresent(
  join(projectRoot, ".next", "static"),
  join(standaloneRoot, ".next", "static"),
);
await copyDirectoryIfPresent(join(projectRoot, "public"), join(standaloneRoot, "public"));

await import(pathToFileURL(serverPath).href);
