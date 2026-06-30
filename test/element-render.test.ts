import {describe, expect, it} from "vitest";
import {ShaclRenderer} from "../lib/shacl-renderer.ts";

const SHAPES = `@prefix sh: <http://www.w3.org/ns/shacl#> .
@prefix ex: <http://example.org/> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .
ex:PersonShape a sh:NodeShape ;
   sh:property [ sh:path ex:name ; sh:name "Name" ; sh:datatype xsd:string ] ;
   sh:property [ sh:path ex:bio  ; sh:name "Bio"  ; sh:datatype xsd:string ] .`;

const DATA = `@prefix ex: <http://example.org/> .
ex:alice ex:name "Alice" ; ex:bio "Hello" .`;

const SCORING = `@prefix shui: <http://www.w3.org/ns/shacl-ui#> .
@prefix ex: <http://example.org/> .
ex:tf a shui:WidgetScore ; shui:widget shui:TextFieldEditor ; shui:score 5 .`;

/** Polls until the renderer has finished its async willUpdate pipeline. */
async function waitForReady(el: ShaclRenderer, timeoutMs = 3000) {
   const start = Date.now();
   // eslint-disable-next-line no-unmodified-loop-condition
   while (el.loading && Date.now() - start < timeoutMs) {
      await new Promise(r => setTimeout(r, 10));
   }
   await el.updateComplete;
}

describe("end-to-end widget rendering (post-split)", () => {
   it("drives shapes+data through willUpdate and renders text inputs with values", async () => {
      const el = document.createElement("shacl-renderer") as ShaclRenderer;
      el.shapesGraph = SHAPES;
      el.shapesGraphContentType = "text/turtle";
      el.dataGraph = DATA;
      el.dataGraphContentType = "text/turtle";
      el.widgetScoringGraph = SCORING;
      el.widgetScoringGraphContentType = "text/turtle";
      el.focusNode = "http://example.org/alice";
      el.constraintShape = "http://example.org/PersonShape";
      document.body.appendChild(el);

      await waitForReady(el);

      expect(el.loading).toBe(false);
      expect(el.error).toBeNull();

      const root = el.shadowRoot ?? el;
      const inputs = Array.from(root.querySelectorAll("input")) as HTMLInputElement[];
      expect(inputs.map(i => i.value).sort()).toEqual(["Alice", "Hello"]);

      const labels = Array.from(root.querySelectorAll("label")).map(l => l.textContent?.trim());
      expect(labels).toContain("Name");
      expect(labels).toContain("Bio");
      el.remove();
   });
});
