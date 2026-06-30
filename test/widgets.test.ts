import {describe, expect, it} from "vitest";
import {DataFactory} from "rdf-data-factory";
import {cloneUiComponent} from "../lib/core/clone.ts";
import type {UIComponent} from "../lib/types.ts";

const df = new DataFactory();

function makeComponent(): UIComponent {
   return {
      uuid: "fixed-uuid-1",
      iri: df.namedNode("http://example.org/prop"),
      focusNode: df.namedNode("http://example.org/alice"),
      paths: [{path: "http://example.org/name", type: "predicate"}],
      values: [{value: df.literal("Alice"), path: {path: "http://example.org/name", type: "predicate"}}],
      children: [[
         {
            uuid: "fixed-uuid-2",
            iri: df.namedNode("http://example.org/child"),
            paths: [{path: "http://example.org/street", type: "predicate"}],
            values: [{value: df.literal("Main St"), path: {path: "http://example.org/street", type: "predicate"}}],
         },
      ]],
   };
}

describe("cloneUiComponent", () => {
   it("re-creates RDF terms with working prototype methods", () => {
      const original = makeComponent();
      const clone = cloneUiComponent(original);

      // Different object identity, but value-equal terms with a usable .equals().
      expect(clone.focusNode).not.toBe(original.focusNode);
      expect(typeof clone.focusNode!.equals).toBe("function");
      expect(clone.focusNode!.equals(original.focusNode!)).toBe(true);
      expect(clone.values[0].value.termType).toBe("Literal");
      expect(clone.values[0].value.equals(original.values[0].value)).toBe(true);
   });

   it("assigns a fresh uuid to every component in the tree", () => {
      const original = makeComponent();
      const clone = cloneUiComponent(original);
      expect(clone.uuid).not.toBe(original.uuid);
      expect(clone.children![0][0].uuid).not.toBe(original.children![0][0].uuid);
      // and the two cloned components don't collide with each other
      expect(clone.uuid).not.toBe(clone.children![0][0].uuid);
   });

   it("produces an independent deep copy", () => {
      const original = makeComponent();
      const clone = cloneUiComponent(original);
      clone.values.push({value: df.literal("extra"), path: {path: "x", type: "predicate"}});
      clone.children![0][0].label = "mutated";
      expect(original.values).toHaveLength(1);
      expect(original.children![0][0].label).toBeUndefined();
   });
});
