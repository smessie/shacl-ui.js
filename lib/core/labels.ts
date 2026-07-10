import type {RdfStore} from "rdf-stores";
import {RdfStore as RdfStoreImpl} from "rdf-stores";
import type {Literal, NamedNode, Term} from "@rdfjs/types";
import {DataFactory} from "rdf-data-factory";
import type {LabeledValue} from "../types.ts";
import {DCTERMS, RDF, RDFS, SH, SHUI} from "./namespaces.ts";
import {extractShaclList} from "./rdf-list.ts";
import {rdfDereferencer} from "rdf-dereference";

const df = new DataFactory();

/**
 * Label predicates tried for value nodes, in priority order. The SHACL 1.2 UI specification
 * defaults value-node label resolution to `rdfs:label`; this implementation extends that
 * default with additional common labelling predicates and lets callers override the list.
 */
export const DEFAULT_LABEL_PREDICATES: string[] = [
   RDFS("label").value,
   // DCTERMS("title").value,
   // SKOS("prefLabel").value,
   // SCHEMA("name").value,
];

/** Predicate(s) tried on the property shape for property-label resolution (spec default `sh:name`). */
export const DEFAULT_PROPERTY_LABEL_PREDICATES: string[] = [SH("name").value];

/** Predicates tried for descriptions, in priority order. */
export const DEFAULT_DESCRIPTION_PREDICATES: string[] = [
   RDFS("comment").value,
   DCTERMS("description").value,
   SH("description").value,
];

/**
 * Configuration for label, description and language resolution. All fields are optional; sensible
 * spec-aligned defaults are applied when omitted.
 */
export type LabelResolutionConfig = {
   /** Value-node label predicates, in priority order. Defaults to {@link DEFAULT_LABEL_PREDICATES}. */
   labelPredicates?: string[];
   /** Property-shape label predicates, in priority order. Defaults to {@link DEFAULT_PROPERTY_LABEL_PREDICATES}. */
   propertyLabelPredicates?: string[];
   /** Description predicates, in priority order. Defaults to {@link DEFAULT_DESCRIPTION_PREDICATES}. */
   descriptionPredicates?: string[];
   /**
    * Application/browser preferred languages, in priority order (already resolved from the
    * application configuration and/or `navigator.languages`). Used as priorities 2 and 3 of
    * Language Resolution.
    */
   preferredLanguages?: string[];
   /** When true, dereference IRIs (and an LOV mirror) as an opt-in final label fallback. */
   dereferenceForLabelResolution?: boolean;
};

/** Optional per-call context that refines label resolution for a specific value node. */
export type LabelContext = {
   /** The applicable node shape for the value node (used for the `shui:LabelRole` lookup). */
   nodeShape?: Term;
   /** `sh:languageIn` values from the applicable property-shape context (highest language priority). */
   languageIn?: string[];
};

/**
 * Determines whether a language `tag` matches a preferred language `range` using the RFC 4647
 * basic filtering scheme: a range matches a tag that is equal to it or begins with it followed by
 * `-`. Matching is case-insensitive, so range `en` matches tags `en` and `en-US`.
 */
function languageMatches(range: string, tag?: string): boolean {
   if (!tag) return false;
   const r = range.toLowerCase();
   const t = tag.toLowerCase();
   return t === r || t.startsWith(`${r}-`);
}

/**
 * Selects the best-matching literal from a set of candidate quads according to Language Resolution.
 * Preference order: the `sh:languageIn` list (when supplied), then the application/browser
 * preferred languages. When no preferred language matches, falls back to the first available
 * literal (including language-less literals). Returns `undefined` when there are no literals.
 */
export function selectByLanguage(
   quads: Array<{ object: Term }>,
   opts?: { languageIn?: string[]; preferredLanguages?: string[] },
): Term | undefined {
   const literals = quads
      .map(q => q.object)
      .filter((o): o is Literal => o.termType === "Literal");
   if (literals.length === 0) return undefined;

   const orderedRanges = [...(opts?.languageIn ?? []), ...(opts?.preferredLanguages ?? [])];
   for (const range of orderedRanges) {
      const match = literals.find(literal => languageMatches(range, literal.language));
      if (match) return match;
   }
   // Fallback: any available literal (spec permits falling back to another/undeclared language).
   return literals[0];
}

/**
 * Resolves the ordered list of preferred languages for the application. A non-empty
 * comma-separated `languages` string takes precedence; otherwise the browser's
 * `navigator.languages` is used as the default. Returns an empty list when neither is available.
 */
export function resolvePreferredLanguages(languages?: string): string[] {
   if (languages && languages.trim().length > 0) {
      return languages.split(",").map(part => part.trim()).filter(part => part.length > 0);
   }
   if (typeof navigator !== "undefined" && Array.isArray((navigator as Navigator).languages)) {
      return [...(navigator as Navigator).languages];
   }
   return [];
}

/**
 * Local Name Resolution: derives a human-friendly label from an IRI by taking its local name
 * (the part after the last `#` or `/`) and splitting camelCase identifiers, underscores and
 * hyphens into space-separated words. Falls back to the full IRI when no local name can be
 * derived. For example, `.../givenName` becomes `given Name` and `...#TimBL` becomes `Tim B L`.
 */
export function localNameResolution(iri: string): string {
   const local = (iri.split("#").pop() ?? "").split("/").pop() ?? "";
   if (local.length === 0) return iri;
   const spaced = local
      .replace(/(?<=[A-Za-z])(?=[A-Z])/g, " ")
      .replace(/[_-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
   return spaced.length > 0 ? spaced : iri;
}

/**
 * Finds the property path annotated with `shui:propertyRole shui:LabelRole` on the applicable
 * node shape for value node `V`. The applicable node shape is taken from `ctx.nodeShape` when
 * provided, otherwise it is discovered from the shapes graph by `sh:targetNode`/`sh:targetClass`
 * targeting `V`. Returns the predicate IRI of that path, or `undefined` when none applies.
 */
function findLabelRolePath(V: Term, dataGraph: RdfStore, shapesGraph: RdfStore, ctx?: LabelContext): NamedNode | undefined {
   const nodeShapes: Term[] = [];
   if (ctx?.nodeShape) {
      nodeShapes.push(ctx.nodeShape);
   }
   for (const quad of shapesGraph.getQuads(null, SH("targetNode"), V)) {
      nodeShapes.push(quad.subject);
   }
   const types = [
      ...dataGraph.getQuads(V, RDF("type")),
      ...shapesGraph.getQuads(V, RDF("type")),
   ].map(quad => quad.object);
   for (const type of types) {
      for (const quad of shapesGraph.getQuads(null, SH("targetClass"), type)) {
         nodeShapes.push(quad.subject);
      }
   }

   for (const nodeShape of nodeShapes) {
      for (const propertyQuad of shapesGraph.getQuads(nodeShape, SH("property"))) {
         const propertyShape = propertyQuad.object;
         const roleQuad = shapesGraph.getQuads(propertyShape, SHUI("propertyRole"), SHUI("LabelRole"))[0];
         if (!roleQuad) continue;
         const pathQuad = shapesGraph.getQuads(propertyShape, SH("path"))[0];
         if (pathQuad && pathQuad.object.termType === "NamedNode") {
            return pathQuad.object;
         }
      }
   }
   return undefined;
}

/** Dereferences the IRI (and an LOV mirror) and resolves a label from the fetched graph, if any. */
async function dereferenceLabel(term: Term, labelPredicates: NamedNode[], langOpts: {
   languageIn?: string[];
   preferredLanguages?: string[]
}): Promise<string | undefined> {
   for (const iriToDereference of [
      term.value,
      `https://ajuvercr.github.io/lov-mirror/by-iri/${encodeURIComponent(encodeURIComponent(term.value))}.ttl`,
   ]) {
      try {
         const dereferencedGraph = RdfStoreImpl.createDefault();
         const dereferencedOutput = await rdfDereferencer.dereference(iriToDereference, {
            headers: {"Accept": "application/n-quads,text/turtle;q=0.95,application/ld+json;q=0.9,application/n-triples;q=0.8,*/*;q=0.1"},
         });
         await new Promise((resolve, reject) => {
            dereferencedGraph.import(dereferencedOutput.data).on("end", resolve).on("error", reject);
         });
         const quads = labelPredicates.flatMap(predicate => dereferencedGraph.getQuads(term, predicate));
         const picked = selectByLanguage(quads, langOpts);
         if (picked) return picked.value;
      } catch {
         // Ignore dereferencing errors.
      }
   }
   return undefined;
}

/**
 * Value Node Label resolution (SHACL 1.2 UI). Determines the label for a single value node `V` by
 * applying, in order: (1) literal lexical form, (2) the `shui:LabelRole` path on the applicable
 * node shape, (3) label predicates in the data graph, (4) label predicates in the shapes graph,
 * (optionally) an opt-in dereferencing fallback, (5) local name resolution for IRIs, and
 * (6) a placeholder for blank nodes. Language Resolution is applied to every candidate set.
 */
export async function toValueNodeLabel(V: Term, dataGraph: RdfStore, shapesGraph: RdfStore, config?: LabelResolutionConfig, ctx?: LabelContext): Promise<string> {
   const cfg = config ?? {};
   const langOpts = {languageIn: ctx?.languageIn, preferredLanguages: cfg.preferredLanguages};

   // Step 1: a literal uses its lexical form.
   if (V.termType === "Literal") {
      return V.value;
   }

   // Step 2: shui:LabelRole path on the applicable node shape, read from the data graph.
   const labelRolePath = findLabelRolePath(V, dataGraph, shapesGraph, ctx);
   if (labelRolePath) {
      const picked = selectByLanguage(dataGraph.getQuads(V, labelRolePath), langOpts);
      if (picked) return picked.value;
   }

   const labelPredicates = (cfg.labelPredicates ?? DEFAULT_LABEL_PREDICATES).map(p => df.namedNode(p));

   // Step 3: label predicates in the data graph.
   const dataPicked = selectByLanguage(labelPredicates.flatMap(p => dataGraph.getQuads(V, p)), langOpts);
   if (dataPicked) return dataPicked.value;

   // Step 4: label predicates in the shapes graph.
   const shapesPicked = selectByLanguage(labelPredicates.flatMap(p => shapesGraph.getQuads(V, p)), langOpts);
   if (shapesPicked) return shapesPicked.value;

   // Opt-in fallback: dereference the IRI (and an LOV mirror) before falling back to the local name.
   if (cfg.dereferenceForLabelResolution && V.termType === "NamedNode") {
      const dereferenced = await dereferenceLabel(V, labelPredicates, langOpts);
      if (dereferenced) return dereferenced;
   }

   // Step 5: an IRI uses local name resolution.
   if (V.termType === "NamedNode") {
      return localNameResolution(V.value);
   }

   // Step 6: a blank node uses a placeholder string.
   return "";
}

/** Resolves a description for a term from the configured description predicates, language-resolved. */
function resolveDescription(term: Term, dataGraph: RdfStore, shapesGraph: RdfStore, cfg: LabelResolutionConfig, ctx?: LabelContext): string | undefined {
   const langOpts = {languageIn: ctx?.languageIn, preferredLanguages: cfg.preferredLanguages};
   const predicates = (cfg.descriptionPredicates ?? DEFAULT_DESCRIPTION_PREDICATES).map(p => df.namedNode(p));

   const dataPicked = selectByLanguage(predicates.flatMap(p => dataGraph.getQuads(term, p)), langOpts);
   if (dataPicked) return dataPicked.value;

   const shapesPicked = selectByLanguage(predicates.flatMap(p => shapesGraph.getQuads(term, p)), langOpts);
   return shapesPicked?.value;
}

/**
 * Resolves a human-readable label and description for a value node, following the SHACL 1.2 UI
 * Value Node Label and Language Resolution algorithms. The label is derived via
 * {@link toValueNodeLabel}; the description via the configured description predicates. Language
 * Resolution is applied to both.
 */
export async function toLabeledValue(term: Term, dataGraph: RdfStore, shapesGraph: RdfStore, config?: LabelResolutionConfig, ctx?: LabelContext): Promise<LabeledValue> {
   const cfg = config ?? {};
   const label = await toValueNodeLabel(term, dataGraph, shapesGraph, cfg, ctx);
   const description = resolveDescription(term, dataGraph, shapesGraph, cfg, ctx);
   return {value: term, label, description};
}

/** Extracts the ordered `sh:languageIn` values declared on a property shape, if any. */
export function extractLanguageIn(propertyShape: Term, shapesGraph: RdfStore): string[] | undefined {
   const quad = shapesGraph.getQuads(propertyShape, SH("languageIn"))[0];
   if (!quad) return undefined;
   return extractShaclList(quad.object, shapesGraph).map(term => term.value);
}

/**
 * Property Label resolution (SHACL 1.2 UI). Determines the label for a property UI component whose
 * `sh:path` points to predicate `P`, applying, in order: (1) the property-shape label predicate(s)
 * (default `sh:name`), (2) `rdfs:label` of `P` in the data graph, (3) `rdfs:label` of `P` in the
 * shapes graph, (4) local name resolution of `P`, and (5) for complex paths, an
 * implementation-specific string. Language Resolution — including the property shape's
 * `sh:languageIn` — is applied to every candidate set.
 */
export async function toPropertyLabel(propertyShape: Term, P: string | undefined, dataGraph: RdfStore, shapesGraph: RdfStore, config?: LabelResolutionConfig): Promise<string> {
   const cfg = config ?? {};
   const languageIn = extractLanguageIn(propertyShape, shapesGraph);
   const langOpts = {languageIn, preferredLanguages: cfg.preferredLanguages};

   // Step 1: property-shape label predicate(s), defaulting to sh:name.
   const propertyLabelPredicates = (cfg.propertyLabelPredicates ?? DEFAULT_PROPERTY_LABEL_PREDICATES).map(p => df.namedNode(p));
   const namePicked = selectByLanguage(propertyLabelPredicates.flatMap(p => shapesGraph.getQuads(propertyShape, p)), langOpts);
   if (namePicked) return namePicked.value;

   if (P && P.length > 0) {
      const predicate = df.namedNode(P);

      // Step 2: rdfs:label of the predicate P in the data graph.
      const dataLabel = selectByLanguage(dataGraph.getQuads(predicate, RDFS("label")), langOpts);
      if (dataLabel) return dataLabel.value;

      // Step 3: rdfs:label of the predicate P in the shapes graph.
      const shapesLabel = selectByLanguage(shapesGraph.getQuads(predicate, RDFS("label")), langOpts);
      if (shapesLabel) return shapesLabel.value;

      // Step 4: local name resolution of P.
      return localNameResolution(P);
   }

   // Step 5: complex path — implementation-specific human-readable representation.
   return "";
}
