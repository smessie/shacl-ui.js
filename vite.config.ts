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
         globals: {
            process: true,
         },
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
         "process/": 'process/browser',  // Needed to resolve "TypeError: process.nextTick is not a function" in comunica dependency.
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
