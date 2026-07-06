import {defineConfig} from "vitest/config";

export default defineConfig({
   test: {
      environment: "happy-dom",
      setupFiles: ["./test/setup.ts"],
      include: ["test/**/*.test.ts"],
   },
   resolve: {
      tsconfigPaths: true,
      alias: {
         "@rdfjs/types": new URL("./src/shims/rdfjs-types.ts", import.meta.url).pathname,
      },
   },
});
