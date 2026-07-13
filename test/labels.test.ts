import {describe, expect, it} from "vitest";
import {parseRdf} from "../lib/core/rdf.ts";
import {
   localNameResolution,
   selectByLanguage,
   resolvePreferredLanguages,
   toLabeledValue,
   toPropertyLabel,
   toValueNodeLabel,
} from "../lib/core/labels.ts";
import {DataFactory} from "rdf-data-factory";

const df = new DataFactory();

const TTL = (body: string) => parseRdf(
   `@prefix shui: <http://www.w3.org/ns/shacl-ui/> .
    @prefix sh: <http://www.w3.org/ns/shacl#> .
    @prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
    @prefix foaf: <http://xmlns.com/foaf/0.1/> .
    @prefix ex: <http://example.org/> .
    ${body}`,
   "text/turtle",
);
const EMPTY = () => parseRdf("", "text/turtle");
const iri = (v: string) => df.namedNode(v);
const lit = (v: string, lang?: string) => df.literal(v, lang);

describe("localNameResolution", () => {
   it("splits camelCase into words and capitalizes the result", () => {
      expect(localNameResolution("http://example.org/givenName")).toBe("Given Name");
   });

   it("splits consecutive uppercase letters (spec TimBL example)", () => {
      expect(localNameResolution("http://example.org/ns#TimBL")).toBe("Tim B L");
   });

   it("replaces underscores and hyphens with spaces", () => {
      expect(localNameResolution("http://example.org/full_name")).toBe("Full name");
      expect(localNameResolution("http://example.org/full-name")).toBe("Full name");
   });

   it("splits on digit boundaries", () => {
      expect(localNameResolution("http://example.org/address2Line")).toBe("Address 2 Line");
      expect(localNameResolution("http://example.org/line2")).toBe("Line 2");
   });

   it("uses the local name after the last # or /", () => {
      expect(localNameResolution("http://example.org/ns#Person")).toBe("Person");
      expect(localNameResolution("http://example.org/vocab/Person")).toBe("Person");
   });

   it("falls back to the full IRI when there is no local name", () => {
      expect(localNameResolution("http://example.org/path/")).toBe("http://example.org/path/");
   });
});

describe("selectByLanguage", () => {
   const quads = [
      {object: lit("Nom", "fr")},
      {object: lit("Name", "en")},
      {object: lit("Naam", "nl")},
   ] as any[];

   it("prefers sh:languageIn order over everything else", () => {
      const picked = selectByLanguage(quads, {languageIn: ["fr", "en"], preferredLanguages: ["en"]});
      expect(picked?.value).toBe("Nom");
   });

   it("uses preferred (application/browser) languages when no languageIn", () => {
      const picked = selectByLanguage(quads, {preferredLanguages: ["en", "fr"]});
      expect(picked?.value).toBe("Name");
   });

   it("matches with RFC 4647 basic filtering (en matches en-US)", () => {
      const usQuads = [{object: lit("Color", "en-US")}, {object: lit("Couleur", "fr")}] as any[];
      const picked = selectByLanguage(usQuads, {preferredLanguages: ["en"]});
      expect(picked?.value).toBe("Color");
   });

   it("falls back to any available literal when no language matches", () => {
      const picked = selectByLanguage(quads, {preferredLanguages: ["de"]});
      expect(picked?.value).toBe("Nom");
   });

   it("returns undefined for an empty candidate list", () => {
      expect(selectByLanguage([], {preferredLanguages: ["en"]})).toBeUndefined();
   });
});

describe("resolvePreferredLanguages", () => {
   it("parses a comma-separated list", () => {
      expect(resolvePreferredLanguages("fr, en ,nl")).toEqual(["fr", "en", "nl"]);
   });

   it("falls back to navigator.languages when unset", () => {
      const result = resolvePreferredLanguages();
      expect(Array.isArray(result)).toBe(true);
   });
});

describe("toPropertyLabel", () => {
   it("step 1: uses sh:name with language resolution", async () => {
      const shapes = await TTL(`
         ex:shape sh:path ex:name ;
            sh:name "Name"@en ;
            sh:name "Nom"@fr ;
            sh:languageIn ( "fr" "en" ) .`);
      const label = await toPropertyLabel(iri("http://example.org/shape"), "http://example.org/name",
         await EMPTY(), shapes, {preferredLanguages: ["en"]});
      expect(label).toBe("Nom");
   });

   it("step 2: uses rdfs:label of the predicate in the data graph", async () => {
      const shapes = await TTL(`ex:shape sh:path ex:name .`);
      const data = await TTL(`ex:name rdfs:label "The Name"@en .`);
      const label = await toPropertyLabel(iri("http://example.org/shape"), "http://example.org/name",
         data, shapes, {preferredLanguages: ["en"]});
      expect(label).toBe("The Name");
   });

   it("step 3: uses rdfs:label of the predicate in the shapes graph", async () => {
      const shapes = await TTL(`
         ex:shape sh:path ex:name .
         ex:name rdfs:label "Shape Name"@en .`);
      const label = await toPropertyLabel(iri("http://example.org/shape"), "http://example.org/name",
         await EMPTY(), shapes, {preferredLanguages: ["en"]});
      expect(label).toBe("Shape Name");
   });

   it("step 4: falls back to the local name of the predicate", async () => {
      const shapes = await TTL(`ex:shape sh:path ex:givenName .`);
      const label = await toPropertyLabel(iri("http://example.org/shape"), "http://example.org/givenName",
         await EMPTY(), shapes, {preferredLanguages: ["en"]});
      expect(label).toBe("Given Name");
   });
});

describe("toValueNodeLabel", () => {
   it("step 1: a literal uses its lexical form", async () => {
      const label = await toValueNodeLabel(lit("hello"), await EMPTY(), await EMPTY(), {});
      expect(label).toBe("hello");
   });

   it("step 2: uses shui:LabelRole property path from the applicable node shape", async () => {
      const shapes = await TTL(`
         ex:PersonShape a sh:NodeShape ;
            sh:targetClass ex:Person ;
            sh:property [ sh:path foaf:name ; shui:propertyRole shui:LabelRole ] .`);
      const data = await TTL(`
         ex:alice a ex:Person ; foaf:name "Alice"@en , "Alicia"@es ; rdfs:label "AL" .`);
      const label = await toValueNodeLabel(iri("http://example.org/alice"), data, shapes,
         {preferredLanguages: ["en"]});
      expect(label).toBe("Alice");
   });

   it("step 3: uses rdfs:label from the data graph", async () => {
      const data = await TTL(`ex:alice rdfs:label "Alice"@en , "Alicia"@es .`);
      const label = await toValueNodeLabel(iri("http://example.org/alice"), data, await EMPTY(),
         {preferredLanguages: ["es"]});
      expect(label).toBe("Alicia");
   });

   it("step 4: uses rdfs:label from the shapes graph", async () => {
      const shapes = await TTL(`ex:alice rdfs:label "Alice"@en .`);
      const label = await toValueNodeLabel(iri("http://example.org/alice"), await EMPTY(), shapes,
         {preferredLanguages: ["en"]});
      expect(label).toBe("Alice");
   });

   it("step 5: an IRI without a label uses local name resolution", async () => {
      const label = await toValueNodeLabel(iri("http://example.org/givenName"), await EMPTY(), await EMPTY(), {});
      expect(label).toBe("Given Name");
   });

   it("step 6: a blank node without a label uses a placeholder", async () => {
      const label = await toValueNodeLabel(df.blankNode("b0"), await EMPTY(), await EMPTY(), {});
      expect(label).toBe("");
   });
});

describe("toLabeledValue", () => {
   it("returns value, resolved label and language-resolved description", async () => {
      const data = await TTL(`
         ex:alice rdfs:label "Alice"@en , "Alicia"@es ;
            rdfs:comment "A person"@en , "Una persona"@es .`);
      const lv = await toLabeledValue(iri("http://example.org/alice"), data, await EMPTY(),
         {preferredLanguages: ["es"]});
      expect(lv.label).toBe("Alicia");
      expect(lv.description).toBe("Una persona");
   });

   it("falls back to local name resolution for an unlabelled IRI", async () => {
      const lv = await toLabeledValue(iri("http://example.org/givenName"), await EMPTY(), await EMPTY(), {});
      expect(lv.label).toBe("Given Name");
   });
});
