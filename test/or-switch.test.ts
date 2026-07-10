import {describe, expect, it} from "vitest";
import "../lib/shacl-renderer.ts";
import type {ShaclRenderer} from "../lib/shacl-renderer.ts";
import {DataFactory} from "rdf-data-factory";

const df = new DataFactory();

/** Polls until the renderer has finished its async willUpdate pipeline. */
async function waitForReady(el: ShaclRenderer, timeoutMs = 3000) {
   const start = Date.now();
   // eslint-disable-next-line no-unmodified-loop-condition
   while (el.loading && Date.now() - start < timeoutMs) {
      await new Promise(r => setTimeout(r, 10));
   }
   await el.updateComplete;
}

const SCORING = `@prefix shui: <http://www.w3.org/ns/shacl-ui/> .
@prefix ex: <http://example.org/> .
ex:tf a shui:WidgetScore ; shui:widget shui:TextFieldEditor ; shui:score 5 .`;

const ROOT_OR_SHAPES = `@prefix sh: <http://www.w3.org/ns/shacl#> .
@prefix ex: <http://example.org/> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .
ex:PersonShape a sh:NodeShape ;
   sh:or (
      [
         sh:name "Full name provided" ;
         sh:order 1 ;
         sh:property [ sh:path ex:fullName ; sh:name "Full name" ; sh:datatype xsd:string ; sh:minCount 1 ]
      ]
      [
         sh:name "First and last name" ;
         sh:order 2 ;
         sh:property [ sh:path ex:firstName ; sh:name "First name" ; sh:datatype xsd:string ; sh:minCount 1 ] ;
         sh:property [ sh:path ex:lastName  ; sh:name "Last name"  ; sh:datatype xsd:string ; sh:minCount 1 ]
      ]
   ) .`;

const ROOT_OR_DATA = `@prefix ex: <http://example.org/> .
ex:alice ex:fullName "Alice Full" .`;

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

describe("root-level sh:or option switching", () => {
   it("removes the previous option's data when a different option is selected", async () => {
      const el = await buildElement(ROOT_OR_SHAPES, ROOT_OR_DATA);

      // Precondition: option 0 (fullName) is selected and its value is in the store.
      expect(el.rootOrGroups).toHaveLength(1);
      expect(el.rootOrGroups[0].selectedIndex).toBe(0);
      const fullNameBefore = el.dataStore!.getQuads(
         null, df.namedNode("http://example.org/fullName"), null,
      );
      expect(fullNameBefore.map(q => q.object.value)).toContain("Alice Full");

      // Switch to option 1 (firstName + lastName).
      await el.selectRootOrOption(0, 1);

      // The previously-selected option's data must be gone.
      const fullNameAfter = el.dataStore!.getQuads(
         null, df.namedNode("http://example.org/fullName"), null,
      );
      expect(fullNameAfter).toHaveLength(0);

      el.remove();
   });
});

const NESTED_NODE_SHAPES = `@prefix sh: <http://www.w3.org/ns/shacl#> .
@prefix ex: <http://example.org/> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .
ex:PersonShape a sh:NodeShape ;
   sh:property [
      sh:path ex:contact ; sh:name "Contact" ;
      sh:or (
         [ sh:node ex:EmailShape ]
         [ sh:node ex:PhoneShape ]
      )
   ] .
ex:EmailShape a sh:NodeShape ;
   sh:property [ sh:path ex:email ; sh:name "Email" ; sh:datatype xsd:string ; sh:minCount 1 ] .
ex:PhoneShape a sh:NodeShape ;
   sh:property [ sh:path ex:phone ; sh:name "Phone" ; sh:datatype xsd:string ; sh:minCount 1 ] .`;

const NESTED_NODE_DATA = `@prefix ex: <http://example.org/> .
ex:alice ex:contact ex:c1 .
ex:c1 ex:email "a@b.com" .`;

describe("nested sh:or (of sh:node) option switching", () => {
   it("removes the previous option's nested data when a different option is selected", async () => {
      const el = await buildElement(NESTED_NODE_SHAPES, NESTED_NODE_DATA);

      const contact = el.ui.find(c => c.label === "Contact")!;
      expect(contact).toBeDefined();
      expect(contact.orNode).toBeDefined();
      expect(contact.values[0].value.value).toBe("http://example.org/c1");

      // Precondition: the email (option 0) nested value is in the store.
      const emailBefore = el.dataStore!.getQuads(null, df.namedNode("http://example.org/email"), null);
      expect(emailBefore.map(q => q.object.value)).toContain("a@b.com");

      // Switch this value to option 1 (Phone).
      el.selectValueOrOption(contact, contact.values[0], 0, 1);

      // The previously-selected option's nested data must be gone.
      const emailAfter = el.dataStore!.getQuads(null, df.namedNode("http://example.org/email"), null);
      expect(emailAfter).toHaveLength(0);

      // The parent node link is preserved.
      const contactLink = el.dataStore!.getQuads(null, df.namedNode("http://example.org/contact"), null);
      expect(contactLink.map(q => q.object.value)).toContain("http://example.org/c1");

      el.remove();
   });
});

const NESTED_DATATYPE_SHAPES = `@prefix sh: <http://www.w3.org/ns/shacl#> .
@prefix ex: <http://example.org/> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .
ex:PersonShape a sh:NodeShape ;
   sh:property [
      sh:path ex:id ; sh:name "Identifier" ; sh:minCount 1 ;
      sh:or ( [ sh:datatype xsd:string ] [ sh:datatype xsd:anyURI ] )
   ] .`;

const NESTED_DATATYPE_DATA = `@prefix ex: <http://example.org/> .
ex:alice ex:id "abc" .`;

describe("nested sh:or (of sh:datatype) option switching", () => {
   it("removes the previous datatype value when a different option is selected", async () => {
      const el = await buildElement(NESTED_DATATYPE_SHAPES, NESTED_DATATYPE_DATA);

      const id = el.ui.find(c => c.label === "Identifier")!;
      expect(id).toBeDefined();
      expect(id.orDatatype).toBeDefined();
      expect(id.values[0].value.value).toBe("abc");

      // Switch to option 1 (xsd:anyURI).
      el.selectValueOrOption(id, id.values[0], 0, 1);

      // The previous string value "abc" must be gone from the store.
      const idQuads = el.dataStore!.getQuads(null, df.namedNode("http://example.org/id"), null);
      expect(idQuads.map(q => q.object.value)).not.toContain("abc");

      el.remove();
   });
});
