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
ex:tf a shui:WidgetScore ; shui:widget shui:TextFieldEditor ; shui:score 5 .
ex:lv a shui:WidgetScore ; shui:widget shui:LiteralViewer ; shui:score 5 .
ex:iv a shui:WidgetScore ; shui:widget shui:IRIViewer ; shui:score 5 .`;

const SHAPES = `@prefix sh: <http://www.w3.org/ns/shacl#> .
@prefix ex: <http://example.org/> .
ex:PersonShape a sh:NodeShape ;
   sh:property [ sh:name "City" ; sh:path ( ex:address ex:city ) ] ;
   sh:property [ sh:name "Reachable" ; sh:path [ sh:zeroOrMorePath ex:knows ] ] ;
   sh:property [ sh:name "KnownTransitively" ; sh:path [ sh:oneOrMorePath ex:knows ] ] ;
   sh:property [ sh:name "MaybeKnows" ; sh:path [ sh:zeroOrOnePath ex:knows ] ] .`;

const DATA = `@prefix ex: <http://example.org/> .
ex:alice ex:address ex:addr1 ; ex:knows ex:bob .
ex:addr1 ex:city "Ghent" .
ex:bob ex:knows ex:carol .`;

async function buildElement(mode: 'edit' | 'view') {
   const el = document.createElement("shacl-renderer") as ShaclRenderer;
   el.mode = mode;
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
   return el;
}

describe("complex property paths in view mode", () => {
   it("collects values through a sequence path", async () => {
      const el = await buildElement("view");
      const city = el.ui.find(c => c.label === "City")!;
      expect(city).toBeDefined();
      expect(city.values.map(v => v.value.value)).toEqual(["Ghent"]);
      el.remove();
   });

   it("collects values through sh:zeroOrMorePath (includes the focus node itself)", async () => {
      const el = await buildElement("view");
      const reachable = el.ui.find(c => c.label === "Reachable")!;
      expect(reachable).toBeDefined();
      expect(reachable.values.map(v => v.value.value).sort()).toEqual([
         "http://example.org/alice",
         "http://example.org/bob",
         "http://example.org/carol",
      ]);
      el.remove();
   });

   it("collects values through sh:oneOrMorePath (excludes the focus node)", async () => {
      const el = await buildElement("view");
      const known = el.ui.find(c => c.label === "KnownTransitively")!;
      expect(known).toBeDefined();
      expect(known.values.map(v => v.value.value).sort()).toEqual([
         "http://example.org/bob",
         "http://example.org/carol",
      ]);
      el.remove();
   });

   it("collects values through sh:zeroOrOnePath (focus node plus direct values)", async () => {
      const el = await buildElement("view");
      const maybe = el.ui.find(c => c.label === "MaybeKnows")!;
      expect(maybe).toBeDefined();
      expect(maybe.values.map(v => v.value.value).sort()).toEqual([
         "http://example.org/alice",
         "http://example.org/bob",
      ]);
      el.remove();
   });

   it("still skips complex-path properties in edit mode", async () => {
      const el = await buildElement("edit");
      expect(el.ui.find(c => c.label === "City")).toBeUndefined();
      expect(el.ui.find(c => c.label === "Reachable")).toBeUndefined();
      el.remove();
   });
});
