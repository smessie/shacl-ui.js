import {describe, expect, it} from "vitest";
import "../lib/shacl-renderer.ts";
import type {ShaclRenderer} from "../lib/shacl-renderer.ts";
import {getHtmlLang, setHtmlLang} from "../lib/presentation/widgets/shared.ts";
import {DataFactory} from "rdf-data-factory";

const df = new DataFactory();

/** Polls until the renderer has finished its async willUpdate pipeline. */
async function waitForReady(el: ShaclRenderer, timeoutMs = 3000) {
   const start = Date.now();
   while (el.loading && Date.now() - start < timeoutMs) {
      await new Promise(r => setTimeout(r, 10));
   }
   await el.updateComplete;
}

describe("HTML lang helpers", () => {
   it("reads the lang attribute of a single-root fragment", () => {
      expect(getHtmlLang('<p lang="fr">Bonjour</p>')).toBe("fr");
      expect(getHtmlLang('<p>Hi</p>')).toBeUndefined();
      expect(getHtmlLang('plain text')).toBeUndefined();
   });

   it("sets the lang attribute on a single-root fragment in place", () => {
      expect(setHtmlLang('<p>Hi</p>', 'en')).toBe('<p lang="en">Hi</p>');
      expect(setHtmlLang('<p lang="fr">Salut</p>', 'en')).toBe('<p lang="en">Salut</p>');
   });

   it("wraps multi-node fragments to carry the lang attribute", () => {
      const result = setHtmlLang('Hello <b>world</b>', 'en');
      expect(getHtmlLang(result)).toBe('en');
      expect(result).toContain('Hello <b>world</b>');
   });

   it("removes the lang attribute when no language is given", () => {
      expect(setHtmlLang('<p lang="fr">Salut</p>', undefined)).toBe('<p>Salut</p>');
   });
});

const SCORING = `@prefix shui: <http://www.w3.org/ns/shacl-ui/> .
@prefix ex: <http://example.org/> .
ex:tfl a shui:WidgetScore ; shui:widget shui:TextFieldWithLangEditor ; shui:score 10 .`;

const SCORING_RTE = `@prefix shui: <http://www.w3.org/ns/shacl-ui/> .
@prefix ex: <http://example.org/> .
ex:rte a shui:WidgetScore ; shui:widget shui:RichTextEditor ; shui:score 10 .`;

async function buildElement(shapes: string, data: string, scoring: string = SCORING) {
   const el = document.createElement("shacl-renderer") as ShaclRenderer;
   el.shapesGraph = shapes;
   el.shapesGraphContentType = "text/turtle";
   el.dataGraph = data;
   el.dataGraphContentType = "text/turtle";
   el.widgetScoringGraph = scoring;
   el.widgetScoringGraphContentType = "text/turtle";
   el.focusNode = "http://example.org/alice";
   el.constraintShape = "http://example.org/PersonShape";
   document.body.appendChild(el);
   await waitForReady(el);
   return el;
}

describe("language dropdown on WithLang editors", () => {
   it("offers the sh:languageIn languages via a datalist", async () => {
      const shapes = `@prefix sh: <http://www.w3.org/ns/shacl#> .
@prefix ex: <http://example.org/> .
ex:PersonShape a sh:NodeShape ;
   sh:property [ sh:path ex:greeting ; sh:name "Greeting" ; sh:languageIn ( "fr" "en" "nl" ) ] .`;
      const data = `@prefix ex: <http://example.org/> .
ex:alice ex:greeting "Bonjour"@fr .`;
      const el = await buildElement(shapes, data);
      const datalist = el.renderRoot.querySelector("datalist");
      expect(datalist).not.toBeNull();
      const options = [...datalist!.querySelectorAll("option")].map(o => o.getAttribute("value"));
      expect(options).toEqual(["fr", "en", "nl"]);
      const langInput = el.renderRoot.querySelector("input[list]") as HTMLInputElement;
      expect(langInput).not.toBeNull();
      expect(langInput.getAttribute("list")).toBe(datalist!.id);
      el.remove();
   });
});

describe("RichTextEditor language", () => {
   it("stores the selected language as the lang attribute of the HTML root", async () => {
      const shapes = `@prefix sh: <http://www.w3.org/ns/shacl#> .
@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix ex: <http://example.org/> .
ex:PersonShape a sh:NodeShape ;
   sh:property [ sh:path ex:bio ; sh:name "Bio" ; sh:datatype rdf:HTML ; sh:languageIn ( "fr" "en" ) ] .`;
      const data = `@prefix ex: <http://example.org/> .
@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
ex:alice ex:bio "<p>Hello</p>"^^rdf:HTML .`;
      const el = await buildElement(shapes, data, SCORING_RTE);

      const langSelect = el.renderRoot.querySelector("select[data-rte-lang]") as HTMLSelectElement;
      expect(langSelect).not.toBeNull();
      const values = [...langSelect.querySelectorAll("option")].map(o => o.value);
      expect(values).toContain("fr");
      expect(values).toContain("en");

      langSelect.value = "en";
      langSelect.dispatchEvent(new Event("change", {bubbles: true}));

      const bioQuads = el.dataStore!.getQuads(df.namedNode("http://example.org/alice"), df.namedNode("http://example.org/bio"), null);
      expect(bioQuads).toHaveLength(1);
      expect(getHtmlLang(bioQuads[0].object.value)).toBe("en");
      el.remove();
   });
});
