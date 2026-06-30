import {describe, expect, it} from "vitest";
import {parseRdf} from "../lib/utils/rdf.ts";
import {constructUiComponents, uiComponentsToQuads} from "../lib/utils/ui.ts";
import {ShaclRenderer} from "../lib/shacl-renderer.ts";
import {DataFactory} from "rdf-data-factory";

const df = new DataFactory();

const SHAPES = `@prefix sh: <http://www.w3.org/ns/shacl#> .
@prefix ex: <http://example.org/> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .
ex:PersonShape a sh:NodeShape ;
   sh:property [ sh:path ex:age  ; sh:name "Age"  ; sh:datatype xsd:integer ; sh:order 2 ] ;
   sh:property [ sh:path ex:name ; sh:name "Name" ; sh:datatype xsd:string  ; sh:order 1 ] .`;

const DATA = `@prefix ex: <http://example.org/> .
ex:alice ex:name "Alice" ; ex:age 30 .`;

async function build() {
   const shapes = await parseRdf(SHAPES, "text/turtle");
   const data = await parseRdf(DATA, "text/turtle");
   const widgetScoring = await parseRdf("", "text/turtle");
   const renderer = document.createElement("shacl-renderer") as ShaclRenderer;
   renderer.dataStore = data;
   const focusNode = df.namedNode("http://example.org/alice");
   const result = await constructUiComponents(
      renderer, shapes, df.namedNode("http://example.org/PersonShape"), data, focusNode, widgetScoring,
   );
   return {result, focusNode};
}

describe("constructUiComponents", () => {
   it("builds one component per sh:property, sorted by sh:order", async () => {
      const {result} = await build();
      expect(result.components).toHaveLength(2);
      expect(result.components.map(c => c.label)).toEqual(["Name", "Age"]);
      expect(result.renderSlots.map(s => s.kind)).toEqual(["component", "component"]);
   });

   it("attaches the data-graph values to each component", async () => {
      const {result} = await build();
      const name = result.components.find(c => c.label === "Name")!;
      expect(name.paths).toEqual([{path: "http://example.org/name", type: "predicate"}]);
      expect(name.values.map(v => v.value.value)).toEqual(["Alice"]);
      expect(name.focusNode?.value).toBe("http://example.org/alice");
   });
});

describe("uiComponentsToQuads", () => {
   it("round-trips the focus node's values back into quads", async () => {
      const {result} = await build();
      const quads = uiComponentsToQuads(result.components);
      const triples = quads.map(q => `${q.subject.value} ${q.predicate.value} ${q.object.value}`).sort();
      expect(triples).toEqual([
         "http://example.org/alice http://example.org/age 30",
         "http://example.org/alice http://example.org/name Alice",
      ]);
   });
});
