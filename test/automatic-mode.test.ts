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

const DATA = `@prefix ex: <http://example.org/> .
ex:alice a ex:Person ; ex:name "Alice" .`;

async function buildElement(shapes: string, opts: {focusNode?: string; constraintShape?: string}) {
   const el = document.createElement("shacl-renderer") as ShaclRenderer;
   el.shapesGraph = shapes;
   el.shapesGraphContentType = "text/turtle";
   el.dataGraph = DATA;
   el.dataGraphContentType = "text/turtle";
   el.widgetScoringGraph = SCORING;
   el.widgetScoringGraphContentType = "text/turtle";
   if (opts.focusNode) el.focusNode = opts.focusNode;
   if (opts.constraintShape) el.constraintShape = opts.constraintShape;
   document.body.appendChild(el);
   await waitForReady(el);
   return el;
}

describe("automatic mode", () => {
   it("derives the constraint shape from sh:targetClass when only the focus node is given", async () => {
      const shapes = `@prefix sh: <http://www.w3.org/ns/shacl#> .
@prefix ex: <http://example.org/> .
ex:PersonShape a sh:NodeShape ; sh:targetClass ex:Person ;
   sh:property [ sh:path ex:name ; sh:name "Name" ] .`;
      const el = await buildElement(shapes, {focusNode: "http://example.org/alice"});
      expect(el.error).toBeNull();
      expect(el.ui).toHaveLength(1);
      expect(el.ui[0].values.map(v => v.value.value)).toEqual(["Alice"]);
      el.remove();
   });

   it("derives the focus node from sh:targetNode when only the constraint shape is given", async () => {
      const shapes = `@prefix sh: <http://www.w3.org/ns/shacl#> .
@prefix ex: <http://example.org/> .
ex:PersonShape a sh:NodeShape ; sh:targetNode ex:alice ;
   sh:property [ sh:path ex:name ; sh:name "Name" ] .`;
      const el = await buildElement(shapes, {constraintShape: "http://example.org/PersonShape"});
      expect(el.error).toBeNull();
      expect(el.ui).toHaveLength(1);
      expect(el.ui[0].focusNode?.value).toBe("http://example.org/alice");
      el.remove();
   });

   it("derives the focus node from a sh:targetClass instance when only the constraint shape is given", async () => {
      const shapes = `@prefix sh: <http://www.w3.org/ns/shacl#> .
@prefix ex: <http://example.org/> .
ex:PersonShape a sh:NodeShape ; sh:targetClass ex:Person ;
   sh:property [ sh:path ex:name ; sh:name "Name" ] .`;
      const el = await buildElement(shapes, {constraintShape: "http://example.org/PersonShape"});
      expect(el.error).toBeNull();
      expect(el.ui[0].focusNode?.value).toBe("http://example.org/alice");
      el.remove();
   });

   it("derives both inputs when neither is given", async () => {
      const shapes = `@prefix sh: <http://www.w3.org/ns/shacl#> .
@prefix ex: <http://example.org/> .
ex:PersonShape a sh:NodeShape ; sh:targetClass ex:Person ;
   sh:property [ sh:path ex:name ; sh:name "Name" ] .`;
      const el = await buildElement(shapes, {});
      expect(el.error).toBeNull();
      expect(el.ui).toHaveLength(1);
      expect(el.ui[0].focusNode?.value).toBe("http://example.org/alice");
      el.remove();
   });

   it("reports an error when the missing inputs cannot be derived", async () => {
      const shapes = `@prefix sh: <http://www.w3.org/ns/shacl#> .
@prefix ex: <http://example.org/> .
ex:OrphanShape a sh:NodeShape ;
   sh:property [ sh:path ex:name ; sh:name "Name" ] .`;
      const el = await buildElement(shapes, {constraintShape: "http://example.org/OrphanShape"});
      expect(el.loading).toBe(false);
      expect(el.error).toMatch(/focusNode/);
      el.remove();
   });
});
