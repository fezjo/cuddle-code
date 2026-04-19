import * as esbuild from "esbuild";
import { copyFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const watch = process.argv.includes("--watch");

const ctx = await esbuild.context({
  entryPoints: ["src/extension.ts"],
  bundle: true,
  format: "cjs",
  platform: "node",
  target: "node20",
  outfile: "dist/extension.js",
  external: ["vscode"],
  sourcemap: true,
  logLevel: "info"
});

if (watch) {
  await ctx.watch();
  await copyPromptAsset();
  console.log("esbuild watch mode started");
} else {
  await ctx.rebuild();
  await copyPromptAsset();
  await ctx.dispose();
}

async function copyPromptAsset() {
  const src = resolve("src/llm/SandyPrompt.md");
  const outDir = resolve("dist/llm");
  await mkdir(outDir, { recursive: true });
  await copyFile(src, resolve(outDir, "SandyPrompt.md"));
}
