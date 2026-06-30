import {afterEach, describe, expect, it, vi} from "vitest";
import {DataFactory} from "rdf-data-factory";
import {expandPrefixedIRI, mutateTerm, parseRdf, serializeRdf} from "../lib/core/rdf.ts";
import {XSD} from "../lib/core/namespaces.ts";

const df = new DataFactory();

const TTL = `@prefix ex: <http://example.org/> .
ex:alice ex:name "Alice" .`;

describe("parseRdf / serializeRdf", () => {
   it("parses turtle into a store and round-trips through serialization", async () => {
      const store = await parseRdf(TTL, "text/turtle");
      const quads = store.getQuads(null, null, null);
      expect(quads).toHaveLength(1);
      expect(quads[0].subject.value).toBe("http://example.org/alice");
      expect(quads[0].object.value).toBe("Alice");

      const serialized = await serializeRdf(quads, "text/turtle");
      expect(serialized).toContain("Alice");
      expect(serialized).toContain("ex:alice");
   });

   it("returns an empty store for blank input", async () => {
      const store = await parseRdf("   ", "text/turtle");
      expect(store.getQuads(null, null, null)).toHaveLength(0);
   });
});

describe("mutateTerm", () => {
   it("changes a literal value while keeping its datatype", () => {
      const original = df.literal("5", XSD("integer"));
      const mutated = mutateTerm(original, "7");
      expect(mutated.termType).toBe("Literal");
      expect(mutated.value).toBe("7");
      expect((mutated as ReturnType<typeof df.literal>).datatype.value).toBe(XSD("integer").value);
   });

   it("rebuilds named nodes with a new value", () => {
      const mutated = mutateTerm(df.namedNode("http://example.org/a"), "http://example.org/b");
      expect(mutated.termType).toBe("NamedNode");
      expect(mutated.value).toBe("http://example.org/b");
   });
});

describe("expandPrefixedIRI", () => {
   afterEach(() => vi.restoreAllMocks());

   it("returns already-expanded IRIs untouched without fetching", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch");
      expect(await expandPrefixedIRI("http://example.org/x")).toBe("http://example.org/x");
      expect(await expandPrefixedIRI("urn:uuid:1")).toBe("urn:uuid:1");
      expect(await expandPrefixedIRI("plainstring")).toBe("plainstring");
      expect(fetchSpy).not.toHaveBeenCalled();
   });

   it("expands a known prefix via the lookup service", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
         new Response(JSON.stringify({foaf: "http://xmlns.com/foaf/0.1/"})),
      );
      expect(await expandPrefixedIRI("foaf:name")).toBe("http://xmlns.com/foaf/0.1/name");
   });

   it("falls back to the original string when the lookup fails", async () => {
      vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network"));
      expect(await expandPrefixedIRI("foaf:name")).toBe("foaf:name");
   });
});
