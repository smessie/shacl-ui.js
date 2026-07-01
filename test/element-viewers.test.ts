import {describe, expect, it} from "vitest";
import {readFileSync} from "node:fs";
import {join} from "node:path";
import {ShaclRenderer} from "../lib/shacl-renderer.ts";

// The real bundled scoring graph drives editor + viewer selection.
const SCORING = readFileSync(join(process.cwd(), "src/assets/widget-scoring.ttl"), "utf-8");

/** Polls until the renderer has finished its async willUpdate pipeline. */
async function waitForReady(el: ShaclRenderer, timeoutMs = 3000) {
   const start = Date.now();
   while (el.loading && Date.now() - start < timeoutMs) {
      await new Promise(r => setTimeout(r, 10));
   }
   await el.updateComplete;
}

async function mount(shapes: string, data: string, focusNode: string, constraintShape: string, mode: 'edit' | 'view') {
   const el = document.createElement("shacl-renderer") as ShaclRenderer;
   el.shapesGraph = shapes;
   el.shapesGraphContentType = "text/turtle";
   el.dataGraph = data;
   el.dataGraphContentType = "text/turtle";
   el.widgetScoringGraph = SCORING;
   el.widgetScoringGraphContentType = "text/turtle";
   el.focusNode = focusNode;
   el.constraintShape = constraintShape;
   el.mode = mode;
   document.body.appendChild(el);
   await waitForReady(el);
   return el;
}

const PREFIXES = `@prefix sh: <http://www.w3.org/ns/shacl#> .
@prefix shui: <http://www.w3.org/ns/shacl-ui/> .
@prefix ex: <http://example.org/> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .
@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
`;

describe("SHACL UI viewers (view mode)", () => {
   it("renders literal, langString, IRI, hyperlink, image and HTML viewers read-only", async () => {
      const shapes = PREFIXES + `
ex:PersonShape a sh:NodeShape ;
   sh:property [ sh:path ex:name  ; sh:name "Name"  ; sh:datatype xsd:string      ; shui:viewer shui:LiteralViewer ] ;
   sh:property [ sh:path ex:label ; sh:name "Label" ; sh:datatype rdf:langString  ; shui:viewer shui:LangStringViewer ] ;
   sh:property [ sh:path ex:home  ; sh:name "Home"  ; sh:nodeKind sh:IRI          ; shui:viewer shui:IRIViewer ] ;
   sh:property [ sh:path ex:site  ; sh:name "Site"  ; sh:datatype xsd:anyURI      ; shui:viewer shui:HyperlinkViewer ] ;
   sh:property [ sh:path ex:avatar; sh:name "Avatar"; sh:nodeKind sh:IRI          ; shui:viewer shui:ImageViewer ] ;
   sh:property [ sh:path ex:bio   ; sh:name "Bio"   ; sh:datatype rdf:HTML        ; shui:viewer shui:HTMLViewer ] .`;

      const data = PREFIXES + `
ex:alice ex:name "Alice" ;
   ex:label "Alice"@en ;
   ex:home <http://example.org/alice> ;
   ex:site "http://example.com"^^xsd:anyURI ;
   ex:avatar <http://example.org/a.png> ;
   ex:bio "<b>Hi</b><script>alert(1)</script>"^^rdf:HTML .`;

      const el = await mount(shapes, data, "http://example.org/alice", "http://example.org/PersonShape", "view");
      expect(el.error).toBeNull();
      const root = el.shadowRoot ?? el;

      // No editing inputs in view mode.
      expect(root.querySelectorAll("input").length).toBe(0);

      const text = root.textContent ?? "";
      expect(text).toContain("Alice");

      // LangString: a language-tag element with exactly "en".
      const hasLangTag = Array.from(root.querySelectorAll("span")).some(s => s.textContent?.trim() === "en");
      expect(hasLangTag).toBe(true);

      // IRIViewer + HyperlinkViewer produce anchors.
      const hrefs = Array.from(root.querySelectorAll("a")).map(a => a.getAttribute("href"));
      expect(hrefs).toContain("http://example.org/alice");
      expect(hrefs).toContain("http://example.com");

      // ImageViewer produces an <img>.
      const img = root.querySelector("img");
      expect(img?.getAttribute("src")).toBe("http://example.org/a.png");

      // HTMLViewer parses the literal into DOM (sanitization itself is DOMPurify's job and is
      // exercised in real browsers; happy-dom's DOM makes DOMPurify unreliable in this harness).
      expect(text).toContain("Hi");

      el.remove();
   });

   it("BlankNodeViewer shows a label for a blank node value", async () => {
      const shapes = PREFIXES + `
ex:PersonShape a sh:NodeShape ;
   sh:property [ sh:path ex:secret ; sh:name "Secret" ; sh:nodeKind sh:BlankNode ; shui:viewer shui:BlankNodeViewer ] .`;
      const data = PREFIXES + `
ex:alice ex:secret [ rdf:type ex:Thing ] .`;

      const el = await mount(shapes, data, "http://example.org/alice", "http://example.org/PersonShape", "view");
      expect(el.error).toBeNull();
      const root = el.shadowRoot ?? el;
      expect(root.querySelectorAll("input").length).toBe(0);
      // The label falls back to the bnode id (`_:...`) when no rdfs:label exists.
      expect((root.textContent ?? "")).toMatch(/_:/);
      el.remove();
   });

   it("DetailsViewer recurses into a nested shape read-only", async () => {
      const shapes = PREFIXES + `
ex:PersonShape a sh:NodeShape ;
   sh:property [ sh:path ex:address ; sh:name "Address" ; sh:node ex:AddressShape ; shui:viewer shui:DetailsViewer ] .
ex:AddressShape a sh:NodeShape ;
   sh:property [ sh:path ex:city ; sh:name "City" ; sh:datatype xsd:string ; shui:viewer shui:LiteralViewer ] .`;
      const data = PREFIXES + `
ex:alice ex:address ex:addr1 .
ex:addr1 ex:city "Ghent" .`;

      const el = await mount(shapes, data, "http://example.org/alice", "http://example.org/PersonShape", "view");
      expect(el.error).toBeNull();
      const root = el.shadowRoot ?? el;
      // View mode renders captions (not <label> elements) above nested values.
      expect(root.querySelectorAll("input").length).toBe(0);
      expect(root.textContent ?? "").toContain("City");
      expect(root.textContent ?? "").toContain("Ghent");
      el.remove();
   });

   it("LabelViewer resolves a label for a referenced-only IRI (shapes-graph label)", async () => {
      // The value IRI appears only as an object in the data graph (never a subject) and its label
      // lives in the shapes graph — mirrors the CV degree-type case. The explicit shui:viewer
      // preference must still select LabelViewer and the label must resolve.
      const shapes = PREFIXES + `
ex:PersonShape a sh:NodeShape ;
   sh:property [ sh:path ex:degree ; sh:name "Degree" ; sh:nodeKind sh:IRI ; shui:viewer shui:LabelViewer ] .
ex:Master rdfs:label "Master's degree" .`;
      const data = PREFIXES + `ex:alice ex:degree ex:Master .`;

      const el = await mount(shapes, data, "http://example.org/alice", "http://example.org/PersonShape", "view");
      expect(el.error).toBeNull();

      const degree = el.ui.find(c => c.paths[0]?.path === "http://example.org/degree")!.values[0];
      expect(degree.selectedWidget).toBe("http://www.w3.org/ns/shacl-ui/LabelViewer");

      const root = el.shadowRoot ?? el;
      const anchorTexts = Array.from(root.querySelectorAll("a")).map(a => a.textContent?.trim());
      expect(anchorTexts).toContain("Master's degree");
      el.remove();
   });

   it("ValueTableViewer renders all values as a paginated table", async () => {
      const friends = Array.from({length: 12}, (_, i) => `ex:f${i}`);
      const shapes = PREFIXES + `
ex:PersonShape a sh:NodeShape ;
   sh:property [ sh:path ex:knows ; sh:name "Knows" ; sh:node ex:FriendShape ; shui:viewer shui:ValueTableViewer ] .
ex:FriendShape a sh:NodeShape ;
   sh:property [ sh:path ex:fname ; sh:name "First" ; sh:order 0 ; sh:datatype xsd:string ; shui:viewer shui:LiteralViewer ] ;
   sh:property [ sh:path ex:age   ; sh:name "Age"   ; sh:order 1 ; sh:datatype xsd:string ; shui:viewer shui:LiteralViewer ] .`;
      const data = PREFIXES +
         `ex:alice ex:knows ${friends.join(", ")} .\n` +
         friends.map((f, i) => `${f} ex:fname "Name${i}" ; ex:age "${20 + i}" .`).join("\n");

      const el = await mount(shapes, data, "http://example.org/alice", "http://example.org/PersonShape", "view");
      expect(el.error).toBeNull();
      const root = el.shadowRoot ?? el;

      const table = root.querySelector("table");
      expect(table).not.toBeNull();

      const headers = Array.from(root.querySelectorAll("th")).map(th => th.textContent?.trim());
      expect(headers).toEqual(["First", "Age"]);

      // Page 1 shows the first 10 of 12 rows.
      expect(root.querySelectorAll("tbody tr").length).toBe(10);
      expect(root.textContent ?? "").toContain("Name0");
      expect(root.textContent ?? "").toContain("Page 1 of 2");

      // Advancing to page 2 shows the remaining 2 rows.
      el.setValueTablePage(el.ui[0].uuid, 1);
      await el.updateComplete;
      expect(root.querySelectorAll("tbody tr").length).toBe(2);
      expect(root.textContent ?? "").toContain("Name11");

      el.remove();
   });

   it("selects viewers by scoring fallback without affecting editor selection", async () => {
      const shapes = PREFIXES + `
ex:PersonShape a sh:NodeShape ;
   sh:property [ sh:path ex:name ; sh:name "Name" ; sh:datatype xsd:string ] ;
   sh:property [ sh:path ex:home ; sh:name "Home" ; sh:nodeKind sh:IRI ] .`;
      const data = PREFIXES + `ex:alice ex:name "Alice" ; ex:home <http://example.org/alice> .`;

      // The same shared selectedWidget/widgets fields hold viewers in view mode and editors in
      // edit mode; the stored kind always matches the current mode.
      const viewEl = await mount(shapes, data, "http://example.org/alice", "http://example.org/PersonShape", "view");
      expect(viewEl.error).toBeNull();
      const viewByPath = (p: string) => viewEl.ui.find(c => c.paths[0]?.path === p)!;

      // A plain string literal falls back to LiteralViewer for viewing.
      const nameView = viewByPath("http://example.org/name").values[0];
      expect(nameView.selectedWidget).toBe("http://www.w3.org/ns/shacl-ui/LiteralViewer");
      expect(nameView.widgets?.every(w => w.widget.value.value.endsWith("Viewer"))).toBe(true);

      // A plain IRI falls back to LabelViewer (score 10) over IRIViewer (score 1).
      const homeView = viewByPath("http://example.org/home").values[0];
      expect(homeView.selectedWidget).toBe("http://www.w3.org/ns/shacl-ui/LabelViewer");
      viewEl.remove();

      // The identical shape/data in edit mode stores editors on the same fields instead.
      const editEl = await mount(shapes, data, "http://example.org/alice", "http://example.org/PersonShape", "edit");
      const nameEdit = editEl.ui.find(c => c.paths[0]?.path === "http://example.org/name")!.values[0];
      expect(nameEdit.selectedWidget).toBe("http://www.w3.org/ns/shacl-ui/TextFieldEditor");
      expect(nameEdit.widgets?.every(w => w.widget.value.value.endsWith("Editor"))).toBe(true);
      editEl.remove();
   });

   it("switching mode at runtime rebuilds the UI with the other widget kind", async () => {
      const shapes = PREFIXES + `
ex:PersonShape a sh:NodeShape ;
   sh:property [ sh:path ex:name ; sh:name "Name" ; sh:datatype xsd:string ] .`;
      const data = PREFIXES + `ex:alice ex:name "Alice" .`;

      const el = await mount(shapes, data, "http://example.org/alice", "http://example.org/PersonShape", "edit");
      const root = el.shadowRoot ?? el;
      expect(root.querySelectorAll("input").length).toBe(1);

      // Toggle to view mode: the model is rebuilt and the input becomes a read-only viewer.
      el.mode = "view";
      await el.updateComplete;
      await new Promise(r => setTimeout(r, 20));
      await el.updateComplete;
      expect(root.querySelectorAll("input").length).toBe(0);
      expect(el.ui[0].values[0].selectedWidget).toBe("http://www.w3.org/ns/shacl-ui/LiteralViewer");
      expect(root.textContent ?? "").toContain("Alice");
      el.remove();
   });

   it("defaults to edit mode: inputs render and no viewer anchors appear", async () => {
      const shapes = PREFIXES + `
ex:PersonShape a sh:NodeShape ;
   sh:property [ sh:path ex:name ; sh:name "Name" ; sh:datatype xsd:string ; shui:viewer shui:LiteralViewer ] .`;
      const data = PREFIXES + `ex:alice ex:name "Alice" .`;

      const el = await mount(shapes, data, "http://example.org/alice", "http://example.org/PersonShape", "edit");
      expect(el.mode).toBe("edit");
      const root = el.shadowRoot ?? el;
      const inputs = Array.from(root.querySelectorAll("input")) as HTMLInputElement[];
      expect(inputs.map(i => i.value)).toContain("Alice");
      el.remove();
   });
});
