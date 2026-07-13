import type {Term} from "@rdfjs/types";
import * as RDFJS from '@rdfjs/types';
import type {RdfStore} from "rdf-stores";
import type {LabeledValue, WidgetScore} from "../types.ts";
import {RDF, SHUI} from "./namespaces.ts";
// @ts-ignore
import {Validator} from "shacl-engine";
import {DataFactory} from "rdf-data-factory";
import {toLabeledValue, type LabelResolutionConfig} from "./labels.ts";

const df: RDFJS.DataFactory = new DataFactory();

// Building a shacl-engine Validator walks the entire shapes dataset, so it is by far the
// most expensive part of scoring. The validator depends only on the graph that defines the
// shapes (the scoring graph for widget scoring), which is stable across an entire
// UI-construction run, so cache one per shapes-defining store.
const validatorCache = new WeakMap<RdfStore, any>();

function getValidator(shapesGraph: RdfStore): any {
   let validator = validatorCache.get(shapesGraph);
   if (!validator) {
      validator = new Validator(shapesGraph.asDataset(), {factory: df});
      validatorCache.set(shapesGraph, validator);
   }
   return validator;
}

/**
 * Derived structures of a scoring graph, cached per store. score() runs roughly twice per
 * property plus once per value, and without this cache each run re-scans every
 * shui:WidgetScore / shui:WidgetAcceptMatcher in the scoring graph. Scoring stores are
 * replaced (never mutated) when the graph attribute changes, so a WeakMap keyed on the store
 * invalidates naturally.
 */
type ScoringCache = {
   /** collectWidgetScores result: all well-formed WidgetScores, sorted. Treat as immutable. */
   sortedScores?: {node: Term; widget: Term; score: number}[];
   /** widget IRI → its WidgetAcceptMatcher node (first declared wins), undefined = none. */
   acceptMatcherByWidget?: Map<string, Term | undefined>;
   /** matcher node key → its shapesGraphShape / dataGraphShape terms. */
   matcherShapes: Map<string, {shapesGraphShapes: Term[]; dataGraphShapes: Term[]}>;
   /**
    * widget IRI + label-config fingerprint → resolved label. Assumes widget-IRI labels in the
    * data/shapes graphs do not change mid-session (they virtually never do).
    */
   widgetLabels: Map<string, Promise<LabeledValue>>;
};

const scoringCache = new WeakMap<RdfStore, ScoringCache>();

function getScoringCache(scoringGraph: RdfStore): ScoringCache {
   let cache = scoringCache.get(scoringGraph);
   if (!cache) {
      cache = {matcherShapes: new Map(), widgetLabels: new Map()};
      scoringCache.set(scoringGraph, cache);
   }
   return cache;
}

/** A single result produced by the score function: a widget, the WidgetScore it came from, and its score. */
export type Match = {
   widget: Term;
   source: string;
   score: number;
};

/** Throws when a mandatory input is missing. */
function assertPresent(value: unknown, name: string): void {
   if (value === undefined || value === null) {
      throw new Error(`Scoring: mandatory input "${name}" is missing.`);
   }
}

/**
 * Compare two strings by the Unicode codepoint values of their characters, as required by the
 * Score function's tie-breaking rule. `Array.from` iterates by codepoint (handling surrogate
 * pairs), unlike the default UTF-16 code-unit ordering of `<`/`localeCompare`.
 */
function compareByCodepoint(a: string, b: string): number {
   const ac = Array.from(a);
   const bc = Array.from(b);
   const n = Math.min(ac.length, bc.length);
   for (let i = 0; i < n; i++) {
      const d = (ac[i].codePointAt(0) as number) - (bc[i].codePointAt(0) as number);
      if (d !== 0) return d;
   }
   return ac.length - bc.length;
}

/** Read the shapesGraphShape and dataGraphShape values off any shui:WidgetMatcher node. Cached per store. */
function getMatcherShapes(scoringGraph: RdfStore, matcherNode: Term): {shapesGraphShapes: Term[]; dataGraphShapes: Term[]} {
   const cache = getScoringCache(scoringGraph);
   const key = `${matcherNode.termType}:${matcherNode.value}`;
   let shapes = cache.matcherShapes.get(key);
   if (!shapes) {
      shapes = {
         shapesGraphShapes: scoringGraph.getQuads(matcherNode, SHUI("shapesGraphShape"), null).map(q => q.object),
         dataGraphShapes: scoringGraph.getQuads(matcherNode, SHUI("dataGraphShape"), null).map(q => q.object),
      };
      cache.matcherShapes.set(key, shapes);
   }
   return shapes;
}

/** Find the single shui:WidgetAcceptMatcher whose shui:widget matches the given widget IRI. Cached per store. */
function findAcceptMatcher(scoringGraph: RdfStore, widget: Term): Term | undefined {
   const cache = getScoringCache(scoringGraph);
   if (!cache.acceptMatcherByWidget) {
      // Precompute the whole widget → matcher map in one scan. The first declared matcher for
      // a widget wins, matching the previous `.find` semantics.
      const map = new Map<string, Term | undefined>();
      for (const matcher of scoringGraph.getQuads(null, RDF("type"), SHUI("WidgetAcceptMatcher")).map(q => q.subject)) {
         for (const widgetQuad of scoringGraph.getQuads(matcher, SHUI("widget"), null)) {
            if (!map.has(widgetQuad.object.value)) {
               map.set(widgetQuad.object.value, matcher);
            }
         }
      }
      cache.acceptMatcherByWidget = map;
   }
   return cache.acceptMatcherByWidget.get(widget.value);
}

/**
 * Collect every shui:WidgetScore in the scoring graph as a well-formed {node, widget, score}
 * triple, sorted by score descending and then by the Unicode codepoint value of the widget IRI.
 * @throws Error if any WidgetScore is malformed.
 */
function collectWidgetScores(scoringGraph: RdfStore): {node: Term; widget: Term; score: number}[] {
   const cache = getScoringCache(scoringGraph);
   if (cache.sortedScores) {
      return cache.sortedScores;
   }
   const nodes = scoringGraph.getQuads(null, RDF("type"), SHUI("WidgetScore")).map(q => q.subject);
   const collected = nodes.map(node => {
      const widgetQuads = scoringGraph.getQuads(node, SHUI("widget"), null);
      const scoreQuads = scoringGraph.getQuads(node, SHUI("score"), null);
      if (widgetQuads.length !== 1) {
         throw new Error(`Malformed shui:WidgetScore ${node.value}: expected exactly one shui:widget, found ${widgetQuads.length}.`);
      }
      if (scoreQuads.length !== 1) {
         throw new Error(`Malformed shui:WidgetScore ${node.value}: expected exactly one shui:score, found ${scoreQuads.length}.`);
      }
      const score = parseFloat(scoreQuads[0].object.value);
      if (isNaN(score)) {
         throw new Error(`Malformed shui:WidgetScore ${node.value}: shui:score "${scoreQuads[0].object.value}" is not a number.`);
      }
      return {node, widget: widgetQuads[0].object, score};
   });
   collected.sort((a, b) => (b.score - a.score) || compareByCodepoint(a.widget.value, b.widget.value));
   cache.sortedScores = collected;
   return collected;
}

/**
 * Validation function. Validates a focus node against a list of shape nodes using standard SHACL
 * validation. An empty shape list conforms; a focus node that is not a subject in the target graph
 * does not conform. Malformed shapes log a warning and return false rather than throwing.
 */
export async function validationFunction(focusNode: Term | null | undefined, targetGraph: RdfStore, shapes: Term[], shapesGraph: RdfStore): Promise<boolean> {
   if (shapes.length === 0) {
      return true;
   }
   if (!focusNode) {
      return false;
   }
   // Deviation: literals can never be subjects, but widget scoring must still validate literal
   // value nodes (e.g. an xsd:date value against shui:isDate), so only non-literals are required
   // to appear as a subject in the target graph.
   if (focusNode.termType !== "Literal" && targetGraph.getQuads(focusNode, null, null).length === 0) {
      return false;
   }
   try {
      const validator = getValidator(shapesGraph);
      const dataset = targetGraph.asDataset();
      const results = await Promise.all(shapes.map(shape =>
         validator.validate({dataset, terms: [focusNode]}, [{terms: [shape]}]),
      ));
      return results.every(r => r.conforms);
   } catch (error) {
      console.warn(`Scoring: SHACL validation failed for shape(s) ${shapes.map(s => s.value).join(", ")}:`, error);
      return false;
   }
}

/**
 * Matcher function. Determines whether the shapes declared on a shui:WidgetMatcher node
 * (a shui:WidgetScore or shui:WidgetAcceptMatcher) match the given focus node and shape node.
 */
export async function matcherFunction(
   focusNode: Term | null | undefined,
   dataGraph: RdfStore,
   shapeNode: Term,
   shapesGraph: RdfStore,
   scoringGraph: RdfStore,
   matcherNode: Term,
): Promise<boolean> {
   const {shapesGraphShapes, dataGraphShapes} = getMatcherShapes(scoringGraph, matcherNode);

   // Without a focus node a matcher that only constrains the data graph cannot apply.
   if (!focusNode && dataGraphShapes.length > 0 && shapesGraphShapes.length === 0) {
      return false;
   }

   // Validate the property shape (shape node) against the shapesGraphShape shapes. These shapes are
   // defined in the scoring graph, so the scoring graph acts as the SHACL shapes graph here.
   if (!(await validationFunction(shapeNode, shapesGraph, shapesGraphShapes, scoringGraph))) {
      return false;
   }

   if (!focusNode) {
      return true;
   }

   // Validate the focus node against the dataGraphShape shapes. Deviation: the dataGraphShape
   // shapes are also defined in the scoring graph (not the user's shapes graph), so the scoring
   // graph is used as the SHACL shapes graph for this validation as well.
   return await validationFunction(focusNode, dataGraph, dataGraphShapes, scoringGraph);


}

/**
 * Score function. Returns the widget scores whose matcher applies to the given focus node and
 * shape node, ordered by score (descending) then widget IRI. When `best` is true, only the first
 * matching result is returned.
 */
export async function scoreFunction(
   best: boolean,
   focusNode: Term | null | undefined,
   dataGraph: RdfStore,
   shapeNode: Term,
   shapesGraph: RdfStore,
   scoringGraph: RdfStore,
): Promise<Match[]> {
   assertPresent(dataGraph, "data graph");
   assertPresent(shapeNode, "shape node");
   assertPresent(shapesGraph, "shapes graph");
   assertPresent(scoringGraph, "scoring graph");

   const widgetScores = collectWidgetScores(scoringGraph);
   const toMatch = (s: {node: Term; widget: Term; score: number}): Match => ({
      widget: s.widget,
      source: s.node.value,
      score: s.score,
   });

   if (best) {
      // Sequential so the first matching (highest-ranked) score can be returned early.
      for (const s of widgetScores) {
         if (await matcherFunction(focusNode, dataGraph, shapeNode, shapesGraph, scoringGraph, s.node)) {
            return [toMatch(s)];
         }
      }
      return [];
   }

   // best === false: matcher evaluation is independent per score, so run them concurrently and
   // keep the pre-sorted order for the matches that apply.
   const applies = await Promise.all(widgetScores.map(s =>
      matcherFunction(focusNode, dataGraph, shapeNode, shapesGraph, scoringGraph, s.node),
   ));
   return widgetScores.filter((_, i) => applies[i]).map(toMatch);
}

/**
 * Accept function. Checks whether a widget is applicable to the given focus node and shape node.
 * A widget with no shui:WidgetAcceptMatcher is accepted unconditionally.
 */
export async function acceptFunction(
   focusNode: Term | null | undefined,
   dataGraph: RdfStore,
   shapeNode: Term,
   shapesGraph: RdfStore,
   widgetNode: Term,
   scoringGraph: RdfStore,
): Promise<boolean> {
   const matcher = findAcceptMatcher(scoringGraph, widgetNode);
   if (!matcher) {
      return true;
   }
   return matcherFunction(focusNode, dataGraph, shapeNode, shapesGraph, scoringGraph, matcher);
}

/**
 * Select function. Determines the single widget to use for a focus node and property shape,
 * honouring an explicitly specified widget (via the widget predicate) and the accept gate before
 * falling back to scoring. Returns undefined when no widget is accepted.
 */
export async function selectWidget(
   focusNode: Term | null | undefined,
   dataGraph: RdfStore,
   shapeNode: Term,
   shapesGraph: RdfStore,
   scoringGraph: RdfStore,
   widgetPredicate: Term,
): Promise<Term | undefined> {
   assertPresent(dataGraph, "data graph");
   assertPresent(shapeNode, "shape node");
   assertPresent(shapesGraph, "shapes graph");
   assertPresent(scoringGraph, "scoring graph");
   assertPresent(widgetPredicate, "widget predicate");

   // 1. Explicitly specified widget via the widget predicate (e.g. shui:editor / shui:viewer).
   const explicit = shapesGraph.getQuads(shapeNode, widgetPredicate, null)[0]?.object;
   if (explicit) {
      const matcher = findAcceptMatcher(scoringGraph, explicit);
      if (!matcher) {
         return explicit;
      }
      if (await matcherFunction(focusNode, dataGraph, shapeNode, shapesGraph, scoringGraph, matcher)) {
         return explicit;
      }
      // Not accepted: fall through to scoring.
   }

   // 2. Score, then 3. return the highest-ranked accepted widget.
   const matches = await scoreFunction(false, focusNode, dataGraph, shapeNode, shapesGraph, scoringGraph);
   for (const match of matches) {
      if (await acceptFunction(focusNode, dataGraph, shapeNode, shapesGraph, match.widget, scoringGraph)) {
         return match.widget;
      }
   }
   return undefined;
}

/**
 * Renderer-facing entry point. Produces the ordered, de-duplicated, accept-gated list of widget
 * scores for a focus node and property shape. The first element is the default widget; the rest
 * are the alternatives a user may switch to.
 */
export async function score(focusNode: Term | null, dataGraph: RdfStore, constraintShape: Term, shapesGraph: RdfStore, widgetScoringGraph: RdfStore, labelConfig: LabelResolutionConfig): Promise<WidgetScore[]> {
   const matches = await scoreFunction(false, focusNode, dataGraph, constraintShape, shapesGraph, widgetScoringGraph);

   // Widget Selection post-processing: de-duplicate by widget IRI, keeping the highest score
   // (matches are already sorted by descending score, so the first occurrence wins).
   const seen = new Set<string>();
   const deduped = matches.filter(m => {
      if (seen.has(m.widget.value)) return false;
      seen.add(m.widget.value);
      return true;
   });

   // Accept gate: drop widgets whose WidgetAcceptMatcher rejects them.
   const accepted = await Promise.all(deduped.map(m =>
      acceptFunction(focusNode, dataGraph, constraintShape, shapesGraph, m.widget, widgetScoringGraph),
   ));
   const survivors = deduped.filter((_, i) => accepted[i]);

   // Widget labels are stable for a given scoring store + label configuration, so resolve each
   // widget IRI's label only once instead of per score() call (which runs per property and per
   // value). Cache the promise so concurrent calls share one resolution.
   const cache = getScoringCache(widgetScoringGraph);
   const configFingerprint = JSON.stringify([
      labelConfig.preferredLanguages ?? [],
      labelConfig.labelPredicates ?? [],
      labelConfig.dereferenceForLabelResolution ?? false,
   ]);
   const widgetLabel = (widget: Term): Promise<LabeledValue> => {
      const key = `${widget.value}|${configFingerprint}`;
      let promise = cache.widgetLabels.get(key);
      if (!promise) {
         promise = toLabeledValue(widget, dataGraph, shapesGraph, labelConfig);
         cache.widgetLabels.set(key, promise);
      }
      return promise;
   };

   return Promise.all(survivors.map(async m => ({
      widget: await widgetLabel(m.widget),
      source: m.source,
      score: m.score,
   })));
}
