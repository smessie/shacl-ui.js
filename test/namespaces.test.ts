import {describe, expect, it} from "vitest";
import {prefix, SH, sh, SHUI, shui} from "../lib/utils/namespaces.ts";

describe("namespaces", () => {
   it("builds full IRIs for string helpers", () => {
      expect(sh("property")).toBe("http://www.w3.org/ns/shacl#property");
      expect(shui("WidgetScore")).toBe("http://www.w3.org/ns/shacl-ui#WidgetScore");
   });

   it("builds NamedNodes for the uppercase helpers", () => {
      expect(SH("path").value).toBe("http://www.w3.org/ns/shacl#path");
      expect(SH("path").termType).toBe("NamedNode");
      expect(SHUI("widget").value).toBe("http://www.w3.org/ns/shacl-ui#widget");
   });

   it("compacts known namespaces back to prefixes", () => {
      expect(prefix("http://www.w3.org/ns/shacl#property")).toBe("sh:property");
      expect(prefix("http://example.org/foo")).toBe("ex:foo");
      expect(prefix(undefined)).toBeUndefined();
   });
});
