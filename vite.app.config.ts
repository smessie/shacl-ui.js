import { defineConfig } from "vite";
import { resolve } from "path";
import tailwindcss from "@tailwindcss/vite";
import { nodePolyfills } from "vite-plugin-node-polyfills";
import tailwindShadowDOM from "vite-plugin-tailwind-shadowdom";
import { viteStaticCopy } from "vite-plugin-static-copy";

export default defineConfig({
  plugins: [
    tailwindcss(),
    nodePolyfills({
      // See vite.config.ts: map the `process` module to CJS `process/browser` (avoids the
      // optimizeDeps `{ default, process }` namespace interop bug); the global `process` is
      // guaranteed at runtime by lib/core/ensure-process.ts.
      globals: { process: false },
      overrides: { process: 'process/browser' },
      protocolImports: true,
    }),
    tailwindShadowDOM(),
    viteStaticCopy({
      targets: [
        {
          src: "src/assets",
          dest: ".",
        },
      ],
    }),
  ],
  base: '/shacl-ui.js/',
  build: {
    outDir: "dist/app",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: resolve(__dirname, "src/index.html"),
        cv: resolve(__dirname, "src/cv.html"),
        publication: resolve(__dirname, "src/publication.html"),
        alerts: resolve(__dirname, "src/alerts.html"),
      },
    },
  },
  resolve: {
    tsconfigPaths: true,
    alias: {
      "process/": "process/browser",  // Resolve `require('process')` inside comunica deps; `process.nextTick` itself is guaranteed at runtime by lib/core/ensure-process.ts.
      "@rdfjs/types": resolve(__dirname, "src/shims/rdfjs-types.ts"),
    },
  },
  optimizeDeps: {
    exclude: ["@rdfjs/types"],
  },
});
