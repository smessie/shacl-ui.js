import { defineConfig } from "vite";
import { resolve } from "path";
import tsconfigPaths from "vite-tsconfig-paths";
import tailwindcss from "@tailwindcss/vite";
import { nodePolyfills } from "vite-plugin-node-polyfills";
import tailwindShadowDOM from "vite-plugin-tailwind-shadowdom";
import { viteStaticCopy } from "vite-plugin-static-copy";
import { injectGlobalProcess, processPolyfillOverrides } from "./vite.process-polyfill.ts";

export default defineConfig({
  plugins: [
    tsconfigPaths(),
    tailwindcss(),
    // Provide the global `process` ourselves and map the `process` module to CJS `process/browser`
    // (see vite.process-polyfill.ts) to avoid "TypeError: process.nextTick is not a function".
    injectGlobalProcess,
    nodePolyfills({
      ...processPolyfillOverrides,
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
      },
    },
  },
  resolve: {
    alias: {
      "process/": "process/browser",
      "@rdfjs/types": resolve(__dirname, "src/shims/rdfjs-types.ts"),
    },
  },
  optimizeDeps: {
    exclude: ["@rdfjs/types"],
  },
});



