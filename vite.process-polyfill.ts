import { readFileSync } from "fs";
import { createRequire } from "module";
import type { Plugin } from "vite";

// Self-contained browser `process` implementation (from the npm `process` package). It has no
// imports, so it can be inlined into a synchronous classic <script>.
const processBrowserSource = readFileSync(
   createRequire(import.meta.url).resolve('process/browser'),
   'utf-8',
);

/**
 * Injects a global `process` (with nextTick) as a synchronous classic <script> in <head>, so it
 * exists before any module — app entry or pre-bundled dep — evaluates.
 *
 * We do this instead of using vite-plugin-node-polyfills' own `process` global because keeping that
 * on forces the plugin's ESM shim onto the `process` *module* too. Rolldown's optimizeDeps then
 * hands that shim's `{ default, process }` namespace straight to CJS `require('process')` inside
 * comunica's readable-stream (esbuild used to unwrap `.default`), leaving `process.nextTick`
 * undefined ("TypeError: process.nextTick is not a function"). So we set `globals.process: false`
 * and instead map the `process` *module* to the CJS `process/browser` shim (via the plugin's
 * `overrides`), and provide the global here.
 */
export const injectGlobalProcess: Plugin = {
   name: 'inject-global-process',
   transformIndexHtml() {
      return [
         {
            tag: 'script',
            injectTo: 'head-prepend',
            children: `(function(){var module={exports:{}};${processBrowserSource}\nwindow.process=window.process||module.exports;})();`,
         },
      ];
   },
};

/** Options for `nodePolyfills` that keep the `process` global off (see {@link injectGlobalProcess}). */
export const processPolyfillOverrides = {
   globals: { process: false as const },
   overrides: { process: 'process/browser' },
} as const;
