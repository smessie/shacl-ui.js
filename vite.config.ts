import { defineConfig } from "vite";
import { resolve } from "path";
import dts from "vite-plugin-dts";
import tsconfigPaths from "vite-tsconfig-paths";
import tailwindcss from '@tailwindcss/vite';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import tailwindShadowDOM from "vite-plugin-tailwind-shadowdom";

export default defineConfig({
   plugins: [
      tsconfigPaths(),
      dts({ rollupTypes: true }),
      tailwindcss(),
      nodePolyfills({
         // Don't let the plugin polyfill the `process` module with its ESM shim: rolldown's
         // optimizeDeps hands that shim's `{ default, process }` namespace to CJS `require('process')`
         // in readable-stream, so `process.nextTick` is undefined. Map the module to the CJS
         // `process/browser` (module.exports = process) instead; the global `process` (for bare
         // reads) is guaranteed at runtime by lib/core/ensure-process.ts.
         globals: { process: false },
         overrides: { process: 'process/browser' },
         protocolImports: true,
      }),
      tailwindShadowDOM()
   ],
   build: {
      copyPublicDir: false,
      lib: {
         entry: resolve(__dirname, "lib/shacl-renderer.ts"),
         name: "ShaclRenderer",
         fileName: "shacl-renderer",
      },
   },
   resolve: {
      alias: {
         "process/": 'process/browser',  // Resolve `require('process')` inside comunica deps; `process.nextTick` itself is guaranteed at runtime by lib/core/ensure-process.ts.
         '@rdfjs/types': resolve(__dirname, 'src/shims/rdfjs-types.ts'),  // Needed to resolve "Failed to resolve entry for package "@rdfjs/types". The package may have incorrect main/module/exports specified in its package.json."
      },
   },
   optimizeDeps: {
      exclude: ['@rdfjs/types'],  // Needed to resolve "Failed to resolve entry for package "@rdfjs/types". The package may have incorrect main/module/exports specified in its package.json"
   },
   server: {
      open: "/src/index.html",
   },
});
