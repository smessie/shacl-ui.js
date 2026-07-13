import {describe, expect, it} from "vitest";
import {parseRdf} from "../lib/core/rdf.ts";
import {toValueNodeLabel} from "../lib/core/labels.ts";
import {DataFactory} from "rdf-data-factory";

const df = new DataFactory();

const TTL = (body: string) => parseRdf(
   `@prefix shui: <http://www.w3.org/ns/shacl-ui/> .
    @prefix sh: <http://www.w3.org/ns/shacl#> .
    @prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
    @prefix foaf: <http://xmlns.com/foaf/0.1/> .
    @prefix ex: <http://example.org/> .
    ${body}`,
   "text/turtle",
);
const iri = (v: string) => df.namedNode(v);

const DATA = `ex:alice a ex:Person ;
   foaf:name "Alice" ;
   ex:nick "Ally" ;
   ex:alias "Al" .`;

describe("qualified property-role annotations (shui:propertyRole + sh:order)", () => {
   it("prefers a qualified role annotation over a direct one", async () => {
      const shapes = await TTL(`
         ex:PersonShape a sh:NodeShape ;
            sh:targetClass ex:Person ;
            sh:property [ sh:path foaf:name ; shui:propertyRole shui:LabelRole ] ;
            sh:property [ sh:path ex:nick ;
               shui:propertyRole [ shui:propertyRole shui:LabelRole ; sh:order 0 ] ] .`);
      const data = await TTL(DATA);
      const label = await toValueNodeLabel(iri("http://example.org/alice"), data, shapes, {});
      expect(label).toBe("Ally");
   });

   it("processes qualified annotations in ascending sh:order", async () => {
      const shapes = await TTL(`
         ex:PersonShape a sh:NodeShape ;
            sh:targetClass ex:Person ;
            sh:property [ sh:path ex:alias ;
               shui:propertyRole [ shui:propertyRole shui:LabelRole ; sh:order 1 ] ] ;
            sh:property [ sh:path ex:nick ;
               shui:propertyRole [ shui:propertyRole shui:LabelRole ; sh:order 0 ] ] .`);
      const data = await TTL(DATA);
      const label = await toValueNodeLabel(iri("http://example.org/alice"), data, shapes, {});
      expect(label).toBe("Ally");
   });

   it("falls back to the next role path when the preferred one has no value", async () => {
      const shapes = await TTL(`
         ex:PersonShape a sh:NodeShape ;
            sh:targetClass ex:Person ;
            sh:property [ sh:path ex:missing ;
               shui:propertyRole [ shui:propertyRole shui:LabelRole ; sh:order 0 ] ] ;
            sh:property [ sh:path ex:alias ;
               shui:propertyRole [ shui:propertyRole shui:LabelRole ; sh:order 1 ] ] .`);
      const data = await TTL(DATA);
      const label = await toValueNodeLabel(iri("http://example.org/alice"), data, shapes, {});
      expect(label).toBe("Al");
   });

   it("supports the RDF 1.2 triple-annotation form (sh:order via rdf:reifies)", async () => {
      // Note: the N3 parser only accepts {| ... |} after a top-level triple, so the annotated
      // property shape must be a named (or top-level blank) node, not an inline [ ... ] list.
      const shapes = await TTL(`
         ex:PersonShape a sh:NodeShape ;
            sh:targetClass ex:Person ;
            sh:property [ sh:path foaf:name ; shui:propertyRole shui:LabelRole ] ;
            sh:property ex:nickShape .
         ex:nickShape sh:path ex:nick .
         ex:nickShape shui:propertyRole shui:LabelRole {| sh:order 0 |} .`);
      const data = await TTL(DATA);
      const label = await toValueNodeLabel(iri("http://example.org/alice"), data, shapes, {});
      expect(label).toBe("Ally");
   });

   it("keeps supporting the plain direct annotation", async () => {
      const shapes = await TTL(`
         ex:PersonShape a sh:NodeShape ;
            sh:targetClass ex:Person ;
            sh:property [ sh:path foaf:name ; shui:propertyRole shui:LabelRole ] .`);
      const data = await TTL(DATA);
      const label = await toValueNodeLabel(iri("http://example.org/alice"), data, shapes, {});
      expect(label).toBe("Alice");
   });
});
