import {describe, expect, it} from "vitest";
import {parseRdf} from "../lib/core/rdf.ts";
import {constructUiComponents} from "../lib/core/ui-model.ts";
import type {ShaclRenderer} from "../lib/shacl-renderer.ts";
import "../lib/shacl-renderer.ts";
import {DataFactory} from "rdf-data-factory";

const df = new DataFactory();
const EX = (p: string) => `http://example.org/${p}`;

const SCORING = `@prefix shui: <http://www.w3.org/ns/shacl-ui/> .
@prefix ex: <http://example.org/> .
ex:tf a shui:WidgetScore ; shui:widget shui:TextFieldEditor ; shui:score 5 .`;

async function build(shapes: string, data: string) {
   const shapesStore = await parseRdf(shapes, "text/turtle");
   const dataStore = await parseRdf(data, "text/turtle");
   const scoring = await parseRdf(SCORING, "text/turtle");
   const renderer = document.createElement("shacl-renderer") as ShaclRenderer;
   renderer.dataStore = dataStore;
   return await constructUiComponents(
      renderer, shapesStore, df.namedNode(EX("PersonShape")), dataStore, df.namedNode(EX("alice")), scoring,
   );
}

/**
 * Shapes that refer back to themselves. SHACL leaves recursive shapes undefined, so the UI model
 * must stop expanding them instead of recursing until the process runs out of memory.
 */
describe("recursive shapes", () => {
   const DATA = `@prefix ex: <http://example.org/> .
ex:alice a ex:Person ; ex:name "Alice" ; ex:knows ex:bob .
ex:bob a ex:Person ; ex:name "Bob" .`;

   it("stops expanding a shape that sh:class-references the class it targets", async () => {
      const shapes = `@prefix sh: <http://www.w3.org/ns/shacl#> .
@prefix ex: <http://example.org/> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .
ex:PersonShape a sh:NodeShape ;
   sh:targetClass ex:Person ;
   sh:property [ sh:path ex:name  ; sh:name "Name"  ; sh:datatype xsd:string ] ;
   sh:property [ sh:path ex:knows ; sh:name "Knows" ; sh:class ex:Person ] .`;

      const result = await build(shapes, DATA);
      expect(result.components.map(c => c.label)).toEqual(["Name", "Knows"]);
      const knows = result.components.find(c => c.label === "Knows")!;
      expect(knows.values.map(v => v.value.value)).toEqual([EX("bob")]);
      // The nested level is built once; it must not expand ex:Person again.
      const nested = knows.children?.[0] ?? [];
      expect(nested.map(c => c.label)).toEqual(["Name", "Knows"]);
      expect(nested.find(c => c.label === "Knows")?.children?.[0] ?? []).toEqual([]);
   });

   it("stops expanding a shape that sh:node-references itself", async () => {
      const shapes = `@prefix sh: <http://www.w3.org/ns/shacl#> .
@prefix ex: <http://example.org/> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .
ex:PersonShape a sh:NodeShape ;
   sh:property [ sh:path ex:name  ; sh:name "Name"  ; sh:datatype xsd:string ] ;
   sh:property [ sh:path ex:knows ; sh:name "Knows" ; sh:node ex:PersonShape ] .`;

      const result = await build(shapes, DATA);
      expect(result.components.map(c => c.label)).toEqual(["Name", "Knows"]);
      const knows = result.components.find(c => c.label === "Knows")!;
      expect(knows.defaultChild?.map(c => c.label)).toEqual(["Name", "Knows"]);
      expect(knows.defaultChild?.find(c => c.label === "Knows")?.defaultChild ?? []).toEqual([]);
   });

   it("still expands the same shape twice when it is used by sibling properties", async () => {
      const shapes = `@prefix sh: <http://www.w3.org/ns/shacl#> .
@prefix ex: <http://example.org/> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .
ex:PersonShape a sh:NodeShape ;
   sh:property [ sh:path ex:home ; sh:name "Home" ; sh:node ex:AddressShape ] ;
   sh:property [ sh:path ex:work ; sh:name "Work" ; sh:node ex:AddressShape ] .
ex:AddressShape a sh:NodeShape ;
   sh:property [ sh:path ex:street ; sh:name "Street" ; sh:datatype xsd:string ] .`;

      const result = await build(shapes, `@prefix ex: <http://example.org/> .
ex:alice ex:home ex:h1 ; ex:work ex:w1 .
ex:h1 ex:street "Home St" . ex:w1 ex:street "Work St" .`);

      for (const label of ["Home", "Work"]) {
         const component = result.components.find(c => c.label === label)!;
         expect(component.children?.[0]?.map(c => c.label)).toEqual(["Street"]);
      }
   });
});
