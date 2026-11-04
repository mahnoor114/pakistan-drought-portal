// Renders the framework diagram with print colours to D:\droughts\docs\portal_framework.svg
//   cd portal/frontend && node scripts/render-framework.mjs
import { build } from "esbuild";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, "../../../docs/portal_framework.svg");
const tmp = resolve(here, ".render-framework.tmp.mjs");

await build({
  stdin: {
    contents: `
      import { createElement } from "react";
      import { renderToStaticMarkup } from "react-dom/server";
      import { FrameworkDiagram, PRINT_PALETTE } from "./src/components/FrameworkDiagram.tsx";
      export const markup = renderToStaticMarkup(createElement(FrameworkDiagram, { palette: PRINT_PALETTE }));
    `,
    resolveDir: resolve(here, ".."),
    loader: "tsx",
  },
  bundle: true, packages: "external", platform: "node", format: "esm", jsx: "automatic", outfile: tmp, logLevel: "error",
});
const { markup } = await import(pathToFileURL(tmp).href);
rmSync(tmp);
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, '<?xml version="1.0" encoding="UTF-8"?>\n' +
  markup.replace("<svg ", '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="720" '));
console.log("wrote", out);
