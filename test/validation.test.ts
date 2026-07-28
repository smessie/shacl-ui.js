import {beforeAll, describe, expect, it} from "vitest";
// Side-effect import: registers the <shacl-renderer> custom element.
import "../lib/shacl-renderer.ts";
import type {ShaclRenderer} from "../lib/shacl-renderer.ts";
import {parseRdf} from "../lib/core/rdf.ts";
import {constructUiComponents} from "../lib/core/ui-model.ts";
import {runValidation, mapResultsToUi, buildReportQuads} from "../lib/core/validation.ts";
import {DataFactory} from "rdf-data-factory";

const df = new DataFactory();

const SH = (p: string) => `http://www.w3.org/ns/shacl#${p}`;
const EX = (p: string) => `http://example.org/${p}`;

const SHAPES = `@prefix sh: <http://www.w3.org/ns/shacl#> .
@prefix ex: <http://example.org/> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .
ex:PersonShape a sh:NodeShape ;
   sh:targetClass ex:Person ;
   sh:property [ sh:path ex:name ; sh:name "Name" ; sh:datatype xsd:string ; sh:minCount 1 ] ;
   sh:property [ sh:path ex:age  ; sh:name "Age"  ; sh:datatype xsd:integer ] ;
   sh:property [ sh:path ex:code ; sh:name "Code" ; sh:datatype xsd:string ; sh:pattern "^ABC" ] ;
   sh:property [ sh:path ex:nick ; sh:name "Nick" ; sh:datatype xsd:string ;
                 sh:maxLength 3 ; sh:severity sh:Warning ] .`;

const SCORING = `@prefix shui: <http://www.w3.org/ns/shacl-ui/> .
@prefix ex: <http://example.org/> .
ex:tf a shui:WidgetScore ; shui:widget shui:TextFieldEditor ; shui:score 5 .`;

/** Data with several violations: bad datatype (age), bad pattern (code), warning (nick), and a
 *  missing required name (minCount). */
const DATA_INVALID = `@prefix ex: <http://example.org/> .
ex:alice a ex:Person ; ex:age "abc" ; ex:code "XYZ" ; ex:nick "toolong" .`;

const DATA_VALID = `@prefix ex: <http://example.org/> .
ex:alice a ex:Person ; ex:name "Alice" ; ex:age 30 ; ex:code "ABCD" ; ex:nick "al" .`;

async function waitForReady(el: ShaclRenderer, timeoutMs = 3000) {
   const start = Date.now();
   while (el.loading && Date.now() - start < timeoutMs) {
      await new Promise(r => setTimeout(r, 10));
   }
   await el.updateComplete;
}

/** Polls until `predicate` holds, so asynchronous child renders can settle. */
async function waitFor(predicate: () => boolean, timeoutMs = 3000) {
   const start = Date.now();
   while (!predicate() && Date.now() - start < timeoutMs) {
      await new Promise(r => setTimeout(r, 10));
   }
   return predicate();
}

async function buildElement(data: string): Promise<ShaclRenderer> {
   const el = document.createElement("shacl-renderer") as ShaclRenderer;
   el.shapesGraph = SHAPES;
   el.shapesGraphContentType = "text/turtle";
   el.dataGraph = data;
   el.dataGraphContentType = "text/turtle";
   el.widgetScoringGraph = SCORING;
   el.widgetScoringGraphContentType = "text/turtle";
   el.focusNode = EX("alice");
   el.constraintShape = EX("PersonShape");
   document.body.appendChild(el);
   await waitForReady(el);
   return el;
}

describe("validation core: runValidation + mapResultsToUi", () => {
   async function setup(data: string) {
      const shapes = await parseRdf(SHAPES, "text/turtle");
      const store = await parseRdf(data, "text/turtle");
      const scoring = await parseRdf(SCORING, "text/turtle");
      const renderer = document.createElement("shacl-renderer") as ShaclRenderer;
      const focusNode = df.namedNode(EX("alice"));
      const ui = await constructUiComponents(renderer, shapes, df.namedNode(EX("PersonShape")), store, focusNode, scoring);
      const results = await runValidation(store, shapes, [focusNode], df.namedNode(EX("PersonShape")));
      return {store, shapes, focusNode, ui, results};
   }

   it("conforms (no results) for valid data", async () => {
      const {results} = await setup(DATA_VALID);
      expect(results).toHaveLength(0);
   });

   it("reports a datatype violation mapped to the offending value/widget", async () => {
      const {results, ui} = await setup(DATA_INVALID);
      const maps = mapResultsToUi(results, ui.components);
      // Datatype violation on ex:age "abc" is a value-level error.
      const ageValueErrors = Array.from(maps.valueErrors.values()).flat()
         .filter(r => r.pathString === EX("age"));
      expect(ageValueErrors.length).toBeGreaterThan(0);
      expect(ageValueErrors[0].severity).toBe("violation");
      expect(ageValueErrors[0].value?.value).toBe("abc");
   });

   it("reports a minCount violation as a property-level (component) error", async () => {
      const {results, ui} = await setup(DATA_INVALID);
      const maps = mapResultsToUi(results, ui.components);
      const nameComponent = ui.components.find(c => c.label === "Name")!;
      const componentErrors = maps.componentErrors.get(nameComponent.uuid) ?? [];
      expect(componentErrors.some(r => r.sourceConstraintComponent === SH("MinCountConstraintComponent"))).toBe(true);
   });

   it("distinguishes warning severity from violation", async () => {
      const {results} = await setup(DATA_INVALID);
      const nick = results.find(r => r.pathString === EX("nick"));
      expect(nick?.severity).toBe("warning");
      const code = results.find(r => r.pathString === EX("code"));
      expect(code?.severity).toBe("violation");
   });

   it("builds a standard RDF sh:ValidationReport", async () => {
      const {results} = await setup(DATA_INVALID);
      const quads = buildReportQuads(results);
      const RDF_TYPE = "http://www.w3.org/1999/02/22-rdf-syntax-ns#type";
      const types = quads.filter(q => q.predicate.value === RDF_TYPE).map(q => q.object.value);
      expect(types).toContain(SH("ValidationReport"));
      expect(types).toContain(SH("ValidationResult"));
      const conforms = quads.find(q => q.predicate.value === SH("conforms"));
      expect(conforms?.object.value).toBe("false");
      // Every result carries a focus node and a severity.
      expect(quads.some(q => q.predicate.value === SH("focusNode"))).toBe(true);
      expect(quads.some(q => q.predicate.value === SH("resultSeverity"))).toBe(true);
   });
});

describe("ShaclRenderer.validate() public API", () => {
   it("returns conforms:true and renders no error alerts for valid data", async () => {
      const el = await buildElement(DATA_VALID);
      const report = await el.validate();
      expect(report.conforms).toBe(true);
      expect(report.results).toHaveLength(0);
      await el.updateComplete;
      const root = el.shadowRoot ?? el;
      expect(root.querySelectorAll('[role="alert"]').length).toBe(0);
      el.remove();
   });

   it("returns a structured report and renders per-widget error alerts for invalid data", async () => {
      const el = await buildElement(DATA_INVALID);
      const report = await el.validate();
      expect(report.conforms).toBe(false);
      expect(report.results.length).toBeGreaterThan(0);
      await el.updateComplete;
      const root = el.shadowRoot ?? el;
      const alerts = Array.from(root.querySelectorAll('[role="alert"]'));
      expect(alerts.length).toBeGreaterThan(0);
      const text = alerts.map(a => a.textContent).join(" ");
      // The datatype violation message should be surfaced somewhere in the UI.
      expect(text.length).toBeGreaterThan(0);
      el.remove();
   });

   it("exposes the raw RDF sh:ValidationReport via validationReport()", async () => {
      const el = await buildElement(DATA_INVALID);
      await el.validate();
      const quads = await el.validationReport();
      expect(Array.isArray(quads)).toBe(true);
      const turtle = await el.validationReport("text/turtle") as string;
      expect(turtle).toContain("ValidationReport");
      expect(turtle).toContain("ValidationResult");
      el.remove();
   });

   it("clears a field's error when the user edits that field", async () => {
      const el = await buildElement(DATA_INVALID);
      await el.validate();
      await el.updateComplete;
      const root = el.shadowRoot ?? el;
      const alertsBefore = root.querySelectorAll('[role="alert"]').length;
      expect(alertsBefore).toBeGreaterThan(0);

      // Edit the "code" text field (pattern violation) to a conforming value.
      const inputs = Array.from(root.querySelectorAll("input")) as HTMLInputElement[];
      const codeInput = inputs.find(i => i.value === "XYZ");
      expect(codeInput).toBeTruthy();
      codeInput!.value = "ABCX";
      codeInput!.dispatchEvent(new Event("change"));
      await el.updateComplete;

      const alertsAfter = root.querySelectorAll('[role="alert"]').length;
      expect(alertsAfter).toBeLessThan(alertsBefore);
      el.remove();
   });
});

describe("ShaclRenderer.validate() in collection mode", () => {
   const COLLECTION_DATA = `@prefix ex: <http://example.org/> .
ex:alice a ex:Person ; ex:name "Alice" ; ex:age "abc" .
ex:bob a ex:Person ; ex:name "Bob" ; ex:age "notnum" .`;

   let el: ShaclRenderer;
   beforeAll(async () => {
      el = document.createElement("shacl-renderer") as ShaclRenderer;
      el.shapesGraph = SHAPES;
      el.shapesGraphContentType = "text/turtle";
      el.dataGraph = COLLECTION_DATA;
      el.dataGraphContentType = "text/turtle";
      el.widgetScoringGraph = SCORING;
      el.widgetScoringGraphContentType = "text/turtle";
      // No focusNode => collection mode over the shape's targets.
      el.constraintShape = EX("PersonShape");
      document.body.appendChild(el);
      await waitForReady(el);
   });

   it("aggregates violations across all focus nodes", async () => {
      expect(el.collectionMode).toBe(true);
      const report = await el.validate();
      expect(report.conforms).toBe(false);
      // alice + bob both have a bad xsd:integer age → a violation per focus node.
      const focusNodes = new Set(report.results.map(r => r.focusNode));
      expect(focusNodes.has(EX("alice"))).toBe(true);
      expect(focusNodes.has(EX("bob"))).toBe(true);
   });
});

// ── Path handling: sh:alternativePath and sh:inversePath ─────────────────────

const PATH_SHAPES = `@prefix sh: <http://www.w3.org/ns/shacl#> .
@prefix ex: <http://example.org/> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .
ex:PersonShape a sh:NodeShape ;
   sh:targetClass ex:Person ;
   sh:property [ sh:path [ sh:alternativePath ( ex:nick ex:alias ) ] ;
                 sh:name "Nickname" ; sh:datatype xsd:string ] ;
   sh:property [ sh:path [ sh:inversePath ex:knows ] ;
                 sh:name "Known by" ; sh:class ex:Company ] .`;

/** `ex:alias 5` violates the alternative path's datatype; `ex:org` violates the inverse path's class. */
const PATH_DATA = `@prefix ex: <http://example.org/> .
ex:alice a ex:Person ; ex:alias 5 .
ex:org ex:knows ex:alice .`;

describe("validation of alternative and inverse paths", () => {
   async function setup() {
      const shapes = await parseRdf(PATH_SHAPES, "text/turtle");
      const store = await parseRdf(PATH_DATA, "text/turtle");
      const scoring = await parseRdf(SCORING, "text/turtle");
      const renderer = document.createElement("shacl-renderer") as ShaclRenderer;
      const focusNode = df.namedNode(EX("alice"));
      const ui = await constructUiComponents(renderer, shapes, df.namedNode(EX("PersonShape")), store, focusNode, scoring);
      const results = await runValidation(store, shapes, [focusNode], df.namedNode(EX("PersonShape")));
      return {ui, results, focusNode};
   }

   it("maps an sh:alternativePath violation to the value of the matching alternative", async () => {
      const {ui, results} = await setup();
      const alt = results.find(r => r.sourceConstraintComponent === SH("DatatypeConstraintComponent"))!;
      expect(alt).toBeDefined();
      // Both alternatives are carried, so the result can be matched against the UI component.
      expect(alt.paths.map(p => p.path).sort()).toEqual([EX("alias"), EX("nick")]);

      const maps = mapResultsToUi(results, ui.components);
      // The value-level error is attached to the alternative the value actually uses (ex:alias),
      // not dropped into the node-level block.
      const valueErrors = Array.from(maps.valueErrors.values()).flat();
      expect(valueErrors).toContain(alt);
      expect(Array.from(maps.nodeErrors.values()).flat()).not.toContain(alt);
   });

   it("reports an sh:alternativePath as its full path expression", async () => {
      const {results} = await setup();
      const alt = results.find(r => r.sourceConstraintComponent === SH("DatatypeConstraintComponent"))!;
      expect(alt.pathString).toBe(`(${EX("nick")}|${EX("alias")})`);

      const quads = buildReportQuads(results);
      // sh:resultPath must be a blank node carrying an sh:alternativePath list, never one predicate.
      const resultPath = quads.find(q => q.predicate.value === SH("resultPath") && q.object.termType === "BlankNode");
      expect(resultPath).toBeDefined();
      expect(quads.some(q => q.predicate.value === SH("alternativePath"))).toBe(true);
      expect(quads.some(q => q.predicate.value === SH("resultPath") && q.object.value === EX("nick"))).toBe(false);
   });

   it("keys inverse-path value errors separately from forward-path ones", async () => {
      const {results, ui} = await setup();
      const maps = mapResultsToUi(results, ui.components);
      const inverseKey = Array.from(maps.valueErrors.keys()).find(k => k.includes(EX("knows")));
      expect(inverseKey).toBeDefined();
      expect(inverseKey!.includes(`^${EX("knows")}`)).toBe(true);
   });

   it("clears an inverse-path field's errors when that field is edited", async () => {
      const el = document.createElement("shacl-renderer") as ShaclRenderer;
      el.shapesGraph = PATH_SHAPES;
      el.shapesGraphContentType = "text/turtle";
      el.dataGraph = PATH_DATA;
      el.dataGraphContentType = "text/turtle";
      el.widgetScoringGraph = SCORING;
      el.widgetScoringGraphContentType = "text/turtle";
      el.focusNode = EX("alice");
      el.constraintShape = EX("PersonShape");
      document.body.appendChild(el);
      await waitForReady(el);

      await el.validate();
      expect(el.validationMaps!.valueErrors.size).toBeGreaterThan(0);

      el.clearValidationFor(df.namedNode(EX("alice")), {path: EX("knows"), type: "inverse"});
      const remaining = Array.from(el.validationMaps!.valueErrors.keys()).filter(k => k.includes(EX("knows")));
      expect(remaining).toHaveLength(0);
      el.remove();
   });

   it("falls back to a constraint-derived message when the engine reports none", async () => {
      const {results} = await setup();
      const classResult = results.find(r => r.sourceConstraintComponent === SH("ClassConstraintComponent"))!;
      expect(classResult).toBeDefined();
      expect(classResult.message).not.toBe("");
      expect(classResult.message.toLowerCase()).toContain("class");
   });
});

// ── Messages, source shapes and the conformance-disallow set ─────────────────

const MESSAGE_SHAPES = `@prefix sh: <http://www.w3.org/ns/shacl#> .
@prefix ex: <http://example.org/> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .
ex:PersonShape a sh:NodeShape ;
   sh:targetClass ex:Person ;
   sh:property [ sh:path ex:age ; sh:name "Age" ; sh:datatype xsd:integer ;
                 sh:message "Leeftijd moet een getal zijn"@nl ;
                 sh:message "Age must be a number"@en ] .`;

const MESSAGE_DATA = `@prefix ex: <http://example.org/> .
ex:alice a ex:Person ; ex:age "abc" .`;

describe("validation messages and source shapes", () => {
   async function messagesFor(languages: string[]) {
      const shapes = await parseRdf(MESSAGE_SHAPES, "text/turtle");
      const store = await parseRdf(MESSAGE_DATA, "text/turtle");
      const results = await runValidation(store, shapes, [df.namedNode(EX("alice"))], df.namedNode(EX("PersonShape")), languages);
      return results.map(r => r.message);
   }

   it("matches message languages by language range, not exact tag", async () => {
      expect(await messagesFor(["en-US"])).toContain("Age must be a number");
      expect(await messagesFor(["nl-BE"])).toContain("Leeftijd moet een getal zijn");
   });

   it("keeps a blank-node sh:sourceShape a blank node in the RDF report", async () => {
      const shapes = await parseRdf(SHAPES, "text/turtle");
      const store = await parseRdf(DATA_INVALID, "text/turtle");
      const results = await runValidation(store, shapes, [df.namedNode(EX("alice"))], df.namedNode(EX("PersonShape")));
      const quads = buildReportQuads(results);
      const sourceShapes = quads.filter(q => q.predicate.value === SH("sourceShape"));
      expect(sourceShapes.length).toBeGreaterThan(0);
      // The property shapes are blank nodes; emitting them as IRIs produces an invalid report.
      expect(sourceShapes.every(q => q.object.termType === "BlankNode")).toBe(true);
   });
});

/** Only the `ex:nick` maxLength warning is violated; everything else conforms. */
const DATA_WARNING_ONLY = `@prefix ex: <http://example.org/> .
ex:alice a ex:Person ; ex:name "Alice" ; ex:age 30 ; ex:code "ABCD" ; ex:nick "toolong" .`;

describe("conformance-disallow set (sh:conformanceDisallows)", () => {
   it("does not conform on a warning under the default disallow set", async () => {
      const el = await buildElement(DATA_WARNING_ONLY);
      const report = await el.validate();
      expect(report.results).toHaveLength(1);
      expect(report.conforms).toBe(false);
      el.remove();
   });

   it("conforms on a warning when only sh:Violation is disallowed", async () => {
      const el = document.createElement("shacl-renderer") as ShaclRenderer;
      el.conformanceDisallows = "sh:Violation";
      el.shapesGraph = SHAPES;
      el.shapesGraphContentType = "text/turtle";
      el.dataGraph = DATA_WARNING_ONLY;
      el.dataGraphContentType = "text/turtle";
      el.widgetScoringGraph = SCORING;
      el.widgetScoringGraphContentType = "text/turtle";
      el.focusNode = EX("alice");
      el.constraintShape = EX("PersonShape");
      document.body.appendChild(el);
      await waitForReady(el);

      const report = await el.validate();
      expect(report.results).toHaveLength(1);
      expect(report.conforms).toBe(true);
      expect(report.conformanceDisallows).toEqual([SH("Violation")]);

      const turtle = await el.validationReport("text/turtle") as string;
      expect(turtle).toContain("conformanceDisallows");
      const quads = await el.validationReport() as any[];
      const conforms = quads.find(q => q.predicate.value === SH("conforms"));
      expect(conforms?.object.value).toBe("true");
      el.remove();
   });
});

describe("validate() when validation cannot run", () => {
   it("rejects instead of reporting conformance when the graphs are not loaded", async () => {
      const el = document.createElement("shacl-renderer") as ShaclRenderer;
      document.body.appendChild(el);
      await el.updateComplete;
      await expect(el.validate()).rejects.toThrow(/validat/i);
      el.remove();
   });
});

describe("validation state across rebuilds", () => {
   const OR_SHAPES = `@prefix sh: <http://www.w3.org/ns/shacl#> .
@prefix ex: <http://example.org/> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .
ex:PersonShape a sh:NodeShape ;
   sh:property [ sh:path ex:age ; sh:name "Age" ; sh:datatype xsd:integer ] ;
   sh:or (
      [ sh:name "Full name" ; sh:order 1 ;
        sh:property [ sh:path ex:fullName ; sh:name "Full name" ; sh:datatype xsd:string ; sh:minCount 1 ] ]
      [ sh:name "First and last name" ; sh:order 2 ;
        sh:property [ sh:path ex:firstName ; sh:name "First name" ; sh:datatype xsd:string ; sh:minCount 1 ] ;
        sh:property [ sh:path ex:lastName ; sh:name "Last name" ; sh:datatype xsd:string ; sh:minCount 1 ] ]
   ) .`;

   const OR_DATA = `@prefix ex: <http://example.org/> .
ex:alice ex:firstName "Alice" ; ex:age "abc" .`;

   it("drops the stale RDF report when a root sh:or option is switched", async () => {
      const el = document.createElement("shacl-renderer") as ShaclRenderer;
      el.shapesGraph = OR_SHAPES;
      el.shapesGraphContentType = "text/turtle";
      el.dataGraph = OR_DATA;
      el.dataGraphContentType = "text/turtle";
      el.widgetScoringGraph = SCORING;
      el.widgetScoringGraphContentType = "text/turtle";
      el.focusNode = EX("alice");
      el.constraintShape = EX("PersonShape");
      document.body.appendChild(el);
      await waitForReady(el);

      const report = await el.validate();
      expect(report.results.length).toBeGreaterThan(0);
      expect((await el.validationReport() as any[]).length).toBeGreaterThan(0);

      await el.selectRootOrOption(0, 1);
      expect(el.validationMaps).toBeNull();
      expect(await el.validationReport()).toEqual([]);
      el.remove();
   });
});

describe("validate() in collection mode with pending children", () => {
   const COLLECTION_DATA = `@prefix ex: <http://example.org/> .
ex:alice a ex:Person ; ex:name "Alice" ; ex:age "abc" .
ex:bob a ex:Person ; ex:name "Bob" ; ex:age "notnum" .`;

   function build(focusNodeMode?: 'list' | 'picker') {
      const el = document.createElement("shacl-renderer") as ShaclRenderer;
      el.shapesGraph = SHAPES;
      el.shapesGraphContentType = "text/turtle";
      el.dataGraph = COLLECTION_DATA;
      el.dataGraphContentType = "text/turtle";
      el.widgetScoringGraph = SCORING;
      el.widgetScoringGraphContentType = "text/turtle";
      el.constraintShape = EX("PersonShape");
      if (focusNodeMode) el.focusNodeMode = focusNodeMode;
      document.body.appendChild(el);
      return el;
   }

   it("maps errors onto children that were still building", async () => {
      // No waitForReady: validate() is called while the host and its children still build.
      const el = build();
      await el.validate();
      const children = Array.from((el.shadowRoot ?? el).querySelectorAll("shacl-renderer")) as ShaclRenderer[];
      expect(children).toHaveLength(2);
      for (const child of children) {
         expect(child.validationMaps).not.toBeNull();
         expect(Array.from(child.validationMaps!.valueErrors.values()).flat().length).toBeGreaterThan(0);
      }
      el.remove();
   });

   it("re-applies errors to a child rebuilt by the focus-node picker", async () => {
      const el = build('picker');
      await waitForReady(el);
      await el.validate();

      const childErrors = () => {
         const child = (el.shadowRoot ?? el).querySelector("shacl-renderer") as ShaclRenderer | null;
         return child?.validationMaps ? Array.from(child.validationMaps.valueErrors.values()).flat().length : 0;
      };
      expect(await waitFor(() => childErrors() > 0)).toBe(true);

      el.selectedFocusNode = EX("bob");
      await el.updateComplete;
      expect(await waitFor(() => childErrors() > 0)).toBe(true);
      el.remove();
   });
});
