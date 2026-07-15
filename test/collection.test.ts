import {describe, expect, it} from "vitest";
import {RdfStore} from "rdf-stores";
import {parseRdf} from "../lib/core/rdf.ts";
import {resolveAllFocusNodes} from "../lib/core/ui-model.ts";
import "../lib/shacl-renderer.ts";
import type {ShaclRenderer} from "../lib/shacl-renderer.ts";

async function store(ttl: string): Promise<RdfStore> {
   return await parseRdf(ttl, "text/turtle");
}

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
ex:PersonShape a sh:NodeShape ; sh:targetClass ex:Person ;
   sh:property [ sh:path ex:name ; sh:name "Name" ] .`;

describe("resolveAllFocusNodes", () => {
   it("returns all instances of a sh:targetClass in data-graph order", async () => {
      const shapes = await store(SHAPES);
      const data = await store(`@prefix ex: <http://example.org/> .
ex:alice a ex:Person ; ex:name "Alice" .
ex:bob a ex:Person ; ex:name "Bob" .`);
      const result = resolveAllFocusNodes(shapes, data, "http://example.org/PersonShape");
      expect(result).toEqual(["http://example.org/alice", "http://example.org/bob"]);
   });

   it("returns sh:targetNode targets", async () => {
      const shapes = await store(`@prefix sh: <http://www.w3.org/ns/shacl#> .
@prefix ex: <http://example.org/> .
ex:PersonShape a sh:NodeShape ; sh:targetNode ex:alice, ex:bob .`);
      const data = await store(`@prefix ex: <http://example.org/> .
ex:alice a ex:Person .`);
      const result = resolveAllFocusNodes(shapes, data, "http://example.org/PersonShape");
      expect(result).toEqual(["http://example.org/alice", "http://example.org/bob"]);
   });

   it("returns instances typed directly by the shape IRI (implicit class target)", async () => {
      const shapes = await store(`@prefix sh: <http://www.w3.org/ns/shacl#> .
@prefix ex: <http://example.org/> .
ex:Person a sh:NodeShape .`);
      const data = await store(`@prefix ex: <http://example.org/> .
ex:alice a ex:Person .`);
      const result = resolveAllFocusNodes(shapes, data, "http://example.org/Person");
      expect(result).toEqual(["http://example.org/alice"]);
   });

   it("deduplicates focus nodes reachable through more than one target", async () => {
      const shapes = await store(`@prefix sh: <http://www.w3.org/ns/shacl#> .
@prefix ex: <http://example.org/> .
ex:PersonShape a sh:NodeShape ; sh:targetClass ex:Person ; sh:targetNode ex:alice .`);
      const data = await store(`@prefix ex: <http://example.org/> .
ex:alice a ex:Person .`);
      const result = resolveAllFocusNodes(shapes, data, "http://example.org/PersonShape");
      expect(result).toEqual(["http://example.org/alice"]);
   });

   it("returns an empty array when nothing matches", async () => {
      const shapes = await store(SHAPES);
      const data = await store(`@prefix ex: <http://example.org/> .
ex:widget a ex:Widget .`);
      const result = resolveAllFocusNodes(shapes, data, "http://example.org/PersonShape");
      expect(result).toEqual([]);
   });
});

describe("injected stores", () => {
   it("builds the UI from stores set directly on the element (no graph strings)", async () => {
      const shapes = await store(SHAPES);
      const data = await store(`@prefix ex: <http://example.org/> .
ex:alice a ex:Person ; ex:name "Alice" .`);
      const scoring = await store(SCORING);

      const el = document.createElement("shacl-renderer") as ShaclRenderer;
      el.dataStore = data;
      el.shapesStore = shapes;
      el.widgetScoringStore = scoring;
      el.focusNode = "http://example.org/alice";
      el.constraintShape = "http://example.org/PersonShape";
      document.body.appendChild(el);
      await waitForReady(el);

      expect(el.error).toBeNull();
      expect(el.ui).toHaveLength(1);
      expect(el.ui[0].values.map(v => v.value.value)).toEqual(["Alice"]);
      el.remove();
   });
});
