import {describe, expect, it} from "vitest";
import {RdfStore} from "rdf-stores";
import {DataFactory} from "rdf-data-factory";
import {extractShaclList, extractSubclasses} from "../lib/core/ui-model.ts";
import {RDF, RDFS} from "../lib/core/namespaces.ts";

const df = new DataFactory();

describe("extractShaclList", () => {
   it("reads a well-formed rdf:first/rdf:rest list", async () => {
      const store = RdfStore.createDefault();
      const n1 = df.blankNode("l1");
      const n2 = df.blankNode("l2");
      store.addQuad(df.quad(n1, RDF("first"), df.namedNode("http://example.org/a")));
      store.addQuad(df.quad(n1, RDF("rest"), n2));
      store.addQuad(df.quad(n2, RDF("first"), df.namedNode("http://example.org/b")));
      store.addQuad(df.quad(n2, RDF("rest"), RDF("nil")));
      expect(extractShaclList(n1, store).map(t => t.value)).toEqual([
         "http://example.org/a",
         "http://example.org/b",
      ]);
   });

   it("terminates on a cyclic list instead of looping forever", () => {
      const store = RdfStore.createDefault();
      const n1 = df.blankNode("c1");
      const n2 = df.blankNode("c2");
      store.addQuad(df.quad(n1, RDF("first"), df.namedNode("http://example.org/a")));
      store.addQuad(df.quad(n1, RDF("rest"), n2));
      store.addQuad(df.quad(n2, RDF("first"), df.namedNode("http://example.org/b")));
      store.addQuad(df.quad(n2, RDF("rest"), n1)); // cycle back to the head
      const result = extractShaclList(n1, store);
      expect(result.map(t => t.value)).toEqual([
         "http://example.org/a",
         "http://example.org/b",
      ]);
   });
});

describe("extractSubclasses", () => {
   it("terminates on a cyclic subclass hierarchy", async () => {
      const store = RdfStore.createDefault();
      const empty = RdfStore.createDefault();
      const a = df.namedNode("http://example.org/A");
      const b = df.namedNode("http://example.org/B");
      // B subClassOf A, and A subClassOf B (cycle)
      store.addQuad(df.quad(b, RDFS("subClassOf"), a));
      store.addQuad(df.quad(a, RDFS("subClassOf"), b));
      const subclasses = [a];
      await extractSubclasses(a, empty, store, subclasses);
      // A (seed) + B, with no infinite re-walk and no duplicates.
      expect(subclasses.map(t => t.value).sort()).toEqual([
         "http://example.org/A",
         "http://example.org/B",
      ]);
   });
});
