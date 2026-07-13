import {describe, expect, it} from "vitest";
import "../lib/shacl-renderer.ts";
import type {ShaclRenderer} from "../lib/shacl-renderer.ts";

/** Polls until the renderer has finished its async willUpdate pipeline. */
async function waitForReady(el: ShaclRenderer, timeoutMs = 3000) {
   const start = Date.now();
   while (el.loading && Date.now() - start < timeoutMs) {
      await new Promise(r => setTimeout(r, 10));
   }
   await el.updateComplete;
}

const SCORING = `@prefix shui: <http://www.w3.org/ns/shacl-ui/> .
@prefix ex: <http://example.org/> .
ex:tf a shui:WidgetScore ; shui:widget shui:TextFieldEditor ; shui:score 5 .`;

const SHAPES = `@prefix sh: <http://www.w3.org/ns/shacl#> .
@prefix ex: <http://example.org/> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .
ex:PersonShape a sh:NodeShape ;
   sh:property [ sh:path ex:name ; sh:name "Name" ; sh:datatype xsd:string ] ;
   sh:property [ sh:path ex:name ; sh:maxCount 1 ; sh:description "The name" ] ;
   sh:property [ sh:path ex:age ; sh:name "Age" ; sh:datatype xsd:integer ] .`;

const DATA = `@prefix ex: <http://example.org/> .
ex:alice ex:name "Alice" ; ex:age 30 .`;

async function buildElement(shapes: string, data: string) {
   const el = document.createElement("shacl-renderer") as ShaclRenderer;
   el.shapesGraph = shapes;
   el.shapesGraphContentType = "text/turtle";
   el.dataGraph = data;
   el.dataGraphContentType = "text/turtle";
   el.widgetScoringGraph = SCORING;
   el.widgetScoringGraphContentType = "text/turtle";
   el.focusNode = "http://example.org/alice";
   el.constraintShape = "http://example.org/PersonShape";
   document.body.appendChild(el);
   await waitForReady(el);
   return el;
}

describe("property UI component aggregation", () => {
   it("merges property shapes sharing the same path into one component", async () => {
      const el = await buildElement(SHAPES, DATA);
      const nameComponents = el.ui.filter(c => c.paths.some(p => p.path === "http://example.org/name"));
      expect(nameComponents).toHaveLength(1);
      const name = nameComponents[0];
      // Constraints from BOTH property shapes apply to the merged component.
      expect(name.label).toBe("Name");
      expect(name.description).toBe("The name");
      expect(name.datatype).toBe("http://www.w3.org/2001/XMLSchema#string");
      expect(name.maxCount).toBe(1);
      // The single data value appears once, not once per property shape.
      expect(name.values.map(v => v.value.value)).toEqual(["Alice"]);
      el.remove();
   });

   it("keeps property shapes with different paths separate", async () => {
      const el = await buildElement(SHAPES, DATA);
      expect(el.ui.filter(c => c.paths.some(p => p.path === "http://example.org/age"))).toHaveLength(1);
      expect(el.ui).toHaveLength(2);
      el.remove();
   });
});
