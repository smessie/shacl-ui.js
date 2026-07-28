/**
 * SHACL validation of the data entered in the form.
 *
 * This module is DOM-free and works purely on RDF stores and terms so it can be unit tested in
 * isolation. It wraps the `shacl-engine` `Validator`, flattens the resulting report (including
 * nested `sh:detail` results) into a comparable structure, maps each result to a specific
 * UI component / value / focus node, and can materialize the standard RDF `sh:ValidationReport`.
 */
import type {Term, Quad, Quad_Subject, Quad_Predicate, Quad_Object, NamedNode} from "@rdfjs/types";
import * as RDFJS from "@rdfjs/types";
import type {RdfStore} from "rdf-stores";
import {DataFactory} from "rdf-data-factory";
// @ts-ignore - shacl-engine ships no type declarations.
import {Validator} from "shacl-engine";
import type {Path, UIComponent, ValidationSeverity} from "../types.ts";
import {expandLanguageRange, languageMatches} from "./labels.ts";
import {friendlyMessage} from "./validation-messages.ts";
import {RDF, SH, XSD} from "./namespaces.ts";

const df: RDFJS.DataFactory = new DataFactory();

/**
 * A single, normalized validation result kept in RDF/JS term form so it can be matched against
 * the UI-component tree precisely (by focus node, path and value).
 */
export type ValidationResultInternal = {
   focusNode: Term;
   /**
    * Normalized editable paths (predicate or inverse) of the result. A single entry for a plain
    * path, one entry per alternative for `sh:alternativePath`, and empty for node-level results
    * and for paths that cannot be edited (sequences, quantified paths, …).
    */
   paths: Path[];
   /** Comparable string form of the path (predicate IRI, `^IRI` for inverse, or serialized). */
   pathString?: string;
   value?: Term;
   message: string;
   severity: ValidationSeverity;
   sourceConstraintComponent?: string;
   /** The shape the result originates from, kept as a term (property shapes are usually blank nodes). */
   sourceShape?: Term;
};

/**
 * Error maps consumed by the render layer. Every renderer builds its own maps from the subset of
 * results that match its UI tree, so results for other focus nodes are ignored automatically.
 */
export type ValidationMaps = {
   /** key: `${focusNode}\u0000${pathString}\u0000${valueNT}` → results for a specific value/widget. */
   valueErrors: Map<string, ValidationResultInternal[]>;
   /** key: component `uuid` → property-level results (path matches, no specific rendered value). */
   componentErrors: Map<string, ValidationResultInternal[]>;
   /** key: focus-node value → node-level results (no path). */
   nodeErrors: Map<string, ValidationResultInternal[]>;
};

// A shacl-engine Validator walks the entire shapes dataset on construction, so it is cached per
// shapes store. Form validation needs nested detail results, so this validator is built with
// `details: true` (separate from the scoring validator in score.ts).
const validatorCache = new WeakMap<RdfStore, any>();

function getFormValidator(shapesStore: RdfStore): any {
   let validator = validatorCache.get(shapesStore);
   if (!validator) {
      validator = new Validator(shapesStore.asDataset(), {factory: df, details: true});
      validatorCache.set(shapesStore, validator);
   }
   return validator;
}

function severityFromTerm(severity: Term | undefined): ValidationSeverity {
   const value = severity?.value;
   if (value === SH("Warning").value) return "warning";
   if (value === SH("Info").value) return "info";
   return "violation";
}

/** Comparable string form of an editable path: the predicate IRI, prefixed with `^` when inverse. */
export function pathKey(path: Path): string {
   return path.type === "inverse" ? `^${path.path}` : path.path;
}

/** Whether two editable paths denote the same property in the same direction. */
function pathsEqual(a: Path | undefined, b: Path | undefined): boolean {
   return !!a && !!b && a.path === b.path && a.type === b.type;
}

/**
 * Normalizes a shacl-engine result path (an array of path steps) into a comparable form.
 * A single step maps to editable {@link Path}s matching the paths carried by UI components: one
 * for a plain predicate / inverse path, and one per alternative for `sh:alternativePath` (which
 * the engine encodes as a single step carrying several predicates). Anything else (sequences,
 * quantified paths) gets a best-effort serialized string only.
 */
function normalizePath(pathSteps: unknown): {paths: Path[]; pathString?: string} {
   if (!Array.isArray(pathSteps) || pathSteps.length === 0) return {paths: []};
   const stepPaths = (step: any): Path[] =>
      (step?.predicates ?? []).map((predicate: Term) => ({
         path: predicate.value,
         type: step?.start === "object" ? "inverse" : "predicate",
      } satisfies Path));
   const serializeStep = (step: any): string => {
      const paths = stepPaths(step);
      const base = paths.length === 0
         ? "?"
         : paths.length === 1 ? pathKey(paths[0]) : `(${paths.map(pathKey).join("|")})`;
      const quantifier = step?.quantifier;
      if (quantifier === "oneOrMore") return `${base}+`;
      if (quantifier === "zeroOrMore") return `${base}*`;
      if (quantifier === "zeroOrOne") return `${base}?`;
      return base;
   };
   const steps = pathSteps as any[];
   const pathString = steps.map(serializeStep).join("/");
   if (steps.length === 1 && steps[0]?.quantifier === "one") {
      return {paths: stepPaths(steps[0]), pathString};
   }
   return {paths: [], pathString};
}

/**
 * Derives a message for results the engine reports without one (e.g. `sh:class`), from the local
 * name of the source constraint component: `sh:ClassConstraintComponent` becomes
 * "Value does not conform to the class constraint."
 */
function fallbackMessage(sourceConstraintComponent: string | undefined): string {
   if (!sourceConstraintComponent) return "Value does not conform to the shape.";
   const localName = sourceConstraintComponent.split(/[#/]/).pop() ?? sourceConstraintComponent;
   const words = localName
      .replace(/ConstraintComponent$/, "")
      .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
      .toLowerCase()
      .trim();
   if (words.length === 0) return "Value does not conform to the shape.";
   return `Value does not conform to the ${words} constraint.`;
}

/**
 * Picks the best message literal for the given language preferences, using the same RFC 4647
 * language ranges as label resolution (so `en-US` matches an `@en` message).
 */
function pickMessage(messages: Term[] | undefined, languages: string[]): string | undefined {
   if (!messages || messages.length === 0) return undefined;
   for (const range of languages.flatMap(expandLanguageRange)) {
      const match = messages.find(m => languageMatches(range, (m as RDFJS.Literal).language));
      if (match) return match.value;
   }
   return messages[0].value || undefined;
}

/**
 * Resolves the message shown for a result, in the order the SHACL-UI form needs:
 *
 * 1. An `sh:message` on the source shape — the shapes author's own wording (and language
 *    variants), which `shacl-engine` has already interpolated `$parameter` variables into.
 * 2. A {@link friendlyMessage} derived from the constraint component and its parameter, since the
 *    engine's built-in messages quote RDF terms in Turtle syntax at the person filling in the form.
 * 3. The engine's own message, then a message derived from the constraint component alone.
 */
function resolveMessage(
   rawMessages: Term[] | undefined,
   sourceConstraintComponent: string | undefined,
   sourceShape: Term | undefined,
   shapesStore: RdfStore | undefined,
   languages: string[],
): string {
   const authored = sourceShape && shapesStore
      ? shapesStore.getQuads(sourceShape, SH("message"), null).length > 0
      : false;
   if (authored) {
      const message = pickMessage(rawMessages, languages);
      if (message) return message;
   }
   if (shapesStore) {
      const friendly = friendlyMessage(sourceConstraintComponent, sourceShape, shapesStore, languages);
      if (friendly) return friendly;
   }
   return pickMessage(rawMessages, languages) ?? fallbackMessage(sourceConstraintComponent);
}

/** Options for {@link flattenReportResults}. */
export type FlattenOptions = {
   /** Preferred languages for `sh:message` selection. */
   languages?: string[];
   /** Shapes graph, used to read `sh:message` and the constraint parameters behind each message. */
   shapesStore?: RdfStore;
};

/**
 * Recursively flattens a shacl-engine report's results (and their nested `sh:detail` results)
 * into {@link ValidationResultInternal}s, de-duplicating identical entries.
 */
export function flattenReportResults(rawResults: any[], options: FlattenOptions = {}): ValidationResultInternal[] {
   const {languages = [], shapesStore} = options;
   const out: ValidationResultInternal[] = [];
   const seen = new Set<string>();

   const walk = (results: any[]): void => {
      for (const r of results ?? []) {
         const focusNode: Term | undefined = r.focusNode?.terms?.[0];
         if (!focusNode) {
            if (r.results?.length) walk(r.results);
            continue;
         }
         const {paths, pathString} = normalizePath(r.path);
         const value: Term | undefined = r.value?.terms?.[0];
         const severity = severityFromTerm(r.severity);
         const sourceConstraintComponent: string | undefined = r.constraintComponent?.value;
         const sourceShape: Term | undefined = r.shape?.ptr?.terms?.[0];
         const message = resolveMessage(r.message, sourceConstraintComponent, sourceShape, shapesStore, languages);

         const key = [
            focusNode.value,
            pathString ?? "",
            value ? `${value.termType}:${value.value}` : "",
            severity,
            sourceConstraintComponent ?? "",
            message,
         ].join("\u0000");
         if (!seen.has(key)) {
            seen.add(key);
            out.push({
               focusNode,
               paths,
               pathString,
               value,
               message,
               severity,
               sourceConstraintComponent,
               sourceShape,
            });
         }

         // Recurse into nested detail results (e.g. sh:node / sh:property on nested shapes).
         if (r.results?.length) walk(r.results);
      }
   };

   walk(rawResults);
   return out;
}

/**
 * Runs SHACL validation of the given focus nodes against a constraint shape and returns the
 * flattened results. An empty focus-node set validates vacuously; a failing engine run throws,
 * so that "could not validate" is never mistaken for "conforms".
 */
export async function runValidation(
   dataStore: RdfStore,
   shapesStore: RdfStore,
   focusNodes: Term[],
   constraintShape: Term,
   languages: string[] = [],
): Promise<ValidationResultInternal[]> {
   const nodes = focusNodes.filter(Boolean);
   if (nodes.length === 0) return [];
   try {
      const validator = getFormValidator(shapesStore);
      const report = await validator.validate(
         {dataset: dataStore.asDataset(), terms: nodes},
         [{terms: [constraintShape]}],
      );
      return flattenReportResults(report.results, {languages, shapesStore});
   } catch (error) {
      throw new Error(
         `SHACL validation failed for shape ${constraintShape.value}: ${error instanceof Error ? error.message : String(error)}`,
         {cause: error},
      );
   }
}

const VALUE_KEY_SEP = "\u0000";

/** Key for a value-level error: focus node + path + value node-term. */
export function valueErrorKey(focusNode: Term, path: Path, value: Term): string {
   return [focusNode.value, pathKey(path), `${value.termType}:${value.value}`].join(VALUE_KEY_SEP);
}

/** Key prefix matching every value-level error of one field (focus node + path). */
export function valueErrorKeyPrefix(focusNode: Term, path: Path): string {
   return `${focusNode.value}${VALUE_KEY_SEP}${pathKey(path)}${VALUE_KEY_SEP}`;
}

/** Whether a result applies to the given field: same focus node, and one of its paths. */
export function resultMatchesField(result: ValidationResultInternal, focusNode: Term, path: Path): boolean {
   return result.focusNode.value === focusNode.value && result.paths.some(p => pathsEqual(p, path));
}

function termsEqual(a: Term | undefined, b: Term | undefined): boolean {
   return !!a && !!b && a.termType === b.termType && a.value === b.value;
}

/**
 * Collects every component in a (possibly nested) UI-component tree: base components and their
 * nested `children`, `defaultChild`, and `orNode` children.
 */
function collectComponents(components: UIComponent[], acc: UIComponent[] = []): UIComponent[] {
   for (const component of components) {
      acc.push(component);
      for (const childList of component.children ?? []) collectComponents(childList, acc);
      if (component.defaultChild) collectComponents(component.defaultChild, acc);
      for (const or of component.orNode ?? []) {
         for (const childList of or.children ?? []) collectComponents(childList, acc);
         if (or.defaultChild) collectComponents(or.defaultChild, acc);
      }
   }
   return acc;
}

/**
 * Maps flattened validation results onto a UI-component tree, producing per-value,
 * per-component and node-level error maps. Results that do not match any component in the tree
 * are dropped (they belong to another renderer / focus node).
 */
export function mapResultsToUi(results: ValidationResultInternal[], components: UIComponent[]): ValidationMaps {
   const all = collectComponents(components);
   const maps: ValidationMaps = {
      valueErrors: new Map(),
      componentErrors: new Map(),
      nodeErrors: new Map(),
   };

   const push = (map: Map<string, ValidationResultInternal[]>, key: string, entry: ValidationResultInternal) => {
      const list = map.get(key);
      if (list) list.push(entry);
      else map.set(key, [entry]);
   };

   for (const result of results) {
      // Node-level result (no path): attach to the focus node.
      if (!result.pathString) {
         if (all.some(c => termsEqual(c.focusNode, result.focusNode))) {
            push(maps.nodeErrors, result.focusNode.value, result);
         }
         continue;
      }

      // Find components on this focus node with a path matching one of the result's paths
      // (several for sh:alternativePath, which the UI model flattens the same way).
      const candidates = all.filter(
         c => termsEqual(c.focusNode, result.focusNode)
            && c.paths.some(componentPath => result.paths.some(p => pathsEqual(p, componentPath))),
      );
      if (candidates.length === 0) {
         // Path result whose property is not rendered on this renderer: treat as node-level so it
         // is still surfaced on the closest (this focus node's) area rather than lost.
         if (all.some(c => termsEqual(c.focusNode, result.focusNode))) {
            push(maps.nodeErrors, result.focusNode.value, result);
         }
         continue;
      }

      let attached = false;
      if (result.value) {
         // Value-level: attach to the matching value/widget of a matching component. For an
         // alternative path the value itself determines which alternative it was reached by.
         for (const component of candidates) {
            const match = component.values.find(
               v => result.paths.some(p => pathsEqual(p, v.path)) && termsEqual(v.value, result.value),
            );
            if (match) {
               push(maps.valueErrors, valueErrorKey(result.focusNode, match.path, result.value), result);
               attached = true;
            }
         }
      }
      if (!attached) {
         // Property-level (e.g. minCount, or a value not currently rendered).
         push(maps.componentErrors, candidates[0].uuid, result);
      }
   }

   return maps;
}

// ── Raw RDF sh:ValidationReport materialization ──────────────────────────────
// Built by hand (rather than via shacl-engine's report.dataset, which needs a factory with
// dataset support) so we control the vocabulary and stay dependency-free.

function severityTerm(severity: ValidationSeverity): NamedNode {
   if (severity === "warning") return SH("Warning");
   if (severity === "info") return SH("Info");
   return SH("Violation");
}

// ── Conformance-Disallow Set (sh:conformanceDisallows) ───────────────────────

/**
 * The default conformance-disallow set mandated by SHACL: a report with any result of one of
 * these severities has `sh:conforms false`.
 */
export const DEFAULT_CONFORMANCE_DISALLOWS: ValidationSeverity[] = ["violation", "warning", "info"];

/**
 * Parses a configured conformance-disallow set (a comma- or whitespace-separated list of severity
 * IRIs, `sh:`-prefixed names or bare local names, e.g. `"sh:Violation, sh:Warning"`). Unknown
 * entries are ignored; an empty or fully unrecognized configuration falls back to
 * {@link DEFAULT_CONFORMANCE_DISALLOWS}.
 */
export function parseConformanceDisallows(configured: string | undefined): ValidationSeverity[] {
   const entries = (configured ?? "").split(/[\s,]+/).map(part => part.trim()).filter(Boolean);
   const severities: ValidationSeverity[] = [];
   for (const entry of entries) {
      const localName = entry.split(/[#/:]/).pop()?.toLowerCase();
      const severity = DEFAULT_CONFORMANCE_DISALLOWS.find(s => s === localName);
      if (!severity) {
         console.warn(`Validation: ignoring unknown sh:conformanceDisallows value "${entry}".`);
         continue;
      }
      if (!severities.includes(severity)) severities.push(severity);
   }
   return severities.length > 0 ? severities : [...DEFAULT_CONFORMANCE_DISALLOWS];
}

/** Conformance checking: no result carries a severity from the conformance-disallow set. */
export function conformsTo(results: ValidationResultInternal[], disallowed: ValidationSeverity[]): boolean {
   return !results.some(result => disallowed.includes(result.severity));
}

/** The IRIs of a conformance-disallow set, for the public report and the RDF report. */
export function conformanceDisallowsIris(disallowed: ValidationSeverity[]): string[] {
   return disallowed.map(severity => severityTerm(severity).value);
}

/** Materializes an RDF list of `members` and returns its head (`rdf:nil` when empty). */
function listQuads(members: Quad_Object[], emit: (s: Quad_Subject, p: Quad_Predicate, o: Quad_Object) => void): Quad_Object {
   let head: Quad_Object = RDF("nil");
   for (let index = members.length - 1; index >= 0; index--) {
      const cell = df.blankNode();
      emit(cell, RDF("first"), members[index]);
      emit(cell, RDF("rest"), head);
      head = cell;
   }
   return head;
}

/**
 * Builds a standard RDF `sh:ValidationReport` (with one `sh:ValidationResult` per result) as an
 * array of quads, following the SHACL Core validation-report vocabulary. `sh:conforms` is
 * computed against `disallowed`, which is also emitted as `sh:conformanceDisallows`.
 */
export function buildReportQuads(
   results: ValidationResultInternal[],
   disallowed: ValidationSeverity[] = DEFAULT_CONFORMANCE_DISALLOWS,
): Quad[] {
   const quads: Quad[] = [];
   const report = df.blankNode();
   const q = (s: Quad_Subject, p: Quad_Predicate, o: Quad_Object) => quads.push(df.quad(s, p, o));

   q(report, RDF("type"), SH("ValidationReport"));
   q(report, SH("conforms"), df.literal(conformsTo(results, disallowed) ? "true" : "false", XSD("boolean")));
   for (const severity of disallowed) {
      q(report, SH("conformanceDisallows"), severityTerm(severity));
   }

   for (const result of results) {
      const node = df.blankNode();
      q(report, SH("result"), node);
      q(node, RDF("type"), SH("ValidationResult"));
      q(node, SH("focusNode"), result.focusNode as unknown as Quad_Object);
      q(node, SH("resultSeverity"), severityTerm(result.severity));
      if (result.sourceConstraintComponent) {
         q(node, SH("sourceConstraintComponent"), df.namedNode(result.sourceConstraintComponent));
      }
      if (result.sourceShape) {
         // Property shapes are usually blank nodes, so the term is emitted as-is: re-creating it
         // as a named node would put a blank-node label in IRI position.
         q(node, SH("sourceShape"), result.sourceShape as unknown as Quad_Object);
      }
      if (result.message) {
         q(node, SH("resultMessage"), df.literal(result.message));
      }
      emitResultPath(result, node, q);
      if (result.value) {
         q(node, SH("value"), result.value as unknown as Quad_Object);
      }
   }

   return quads;
}

/** Emits `sh:resultPath` for a result: a predicate IRI, an inverse path, or an alternative path. */
function emitResultPath(
   result: ValidationResultInternal,
   node: Quad_Subject,
   q: (s: Quad_Subject, p: Quad_Predicate, o: Quad_Object) => void,
): void {
   const pathNodeFor = (path: Path): Quad_Object | undefined => {
      if (path.type === "predicate") return df.namedNode(path.path);
      if (path.type === "inverse") {
         const inverse = df.blankNode();
         q(inverse, SH("inversePath"), df.namedNode(path.path));
         return inverse;
      }
      return undefined;
   };
   if (result.paths.length === 1) {
      const pathNode = pathNodeFor(result.paths[0]);
      if (pathNode) q(node, SH("resultPath"), pathNode);
      return;
   }
   if (result.paths.length > 1) {
      const members = result.paths.map(pathNodeFor).filter((m): m is Quad_Object => !!m);
      if (members.length !== result.paths.length) return;
      const alternative = df.blankNode();
      q(node, SH("resultPath"), alternative);
      q(alternative, SH("alternativePath"), listQuads(members, q));
   }
}

/** Converts internal results to the public, string-form structured entries. */
export function toPublicEntries(results: ValidationResultInternal[]) {
   return results.map(r => ({
      focusNode: r.focusNode.value,
      path: r.pathString,
      value: r.value?.value,
      message: r.message,
      severity: r.severity,
      sourceConstraintComponent: r.sourceConstraintComponent,
      // Blank-node shapes are reported in N-Triples notation so they are not mistaken for IRIs.
      sourceShape: r.sourceShape
         ? (r.sourceShape.termType === "BlankNode" ? `_:${r.sourceShape.value}` : r.sourceShape.value)
         : undefined,
   }));
}
