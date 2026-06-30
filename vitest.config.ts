import {defineConfig} from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
   plugins: [tsconfigPaths()],
   test: {
      environment: "happy-dom",
      setupFiles: ["./test/setup.ts"],
      include: ["test/**/*.test.ts"],
   },
   resolve: {
      alias: {
         "@rdfjs/types": new URL("./src/shims/rdfjs-types.ts", import.meta.url).pathname,
      },
   },
});
