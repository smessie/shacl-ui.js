import type {Term} from "@rdfjs/types";
import type {RdfStore} from "rdf-stores";
import type {WidgetScore} from "../types.ts";
import {RDF, SHUI} from "./namespaces.ts";
// @ts-ignore
import {Validator} from "shacl-engine";
import {DataFactory} from "rdf-data-factory";
import * as RDFJS from 'rdf-js';
import {toLabeledValue} from "./ui-model.ts";

const df: RDFJS.DataFactory = new DataFactory();

// Building a shacl-engine Validator walks the entire shapes dataset, so it is by far the
// most expensive part of scoring. The validator depends only on the shapes graph, which is
// stable across an entire UI-construction run, so cache one per shapes-graph store.
const validatorCache = new WeakMap<RdfStore, any>();

function getValidator(shapesGraph: RdfStore): any {
   let validator = validatorCache.get(shapesGraph);
   if (!validator) {
      validator = new Validator(shapesGraph.asDataset(), {factory: df});
      validatorCache.set(shapesGraph, validator);
   }
   return validator;
}

export async function score(focusNode: Term | null, dataGraph: RdfStore, constraintShape: Term, shapesGraph: RdfStore, widgetScoringGraph: RdfStore, dereferenceForLabelResolution: boolean): Promise<WidgetScore[]> {
   let results: WidgetScore[] = [];

   // Get all shui:WidgetScore instances from the widgetScoringGraph
   const widgetScores = widgetScoringGraph.getQuads(null, RDF("type"), SHUI("WidgetScore")).map(quad => quad.subject);

   const ignoreDataGraphShapes = !focusNode;

   for (const widgetScore of widgetScores) {
      // WidgetScore must have exactly one widget (shui:widget) and one score (shui:score)
      const widgetQuads = widgetScoringGraph.getQuads(widgetScore, SHUI("widget"), null);
      const scoreQuads = widgetScoringGraph.getQuads(widgetScore, SHUI("score"), null);

      if (widgetQuads.length !== 1) {
         console.warn(`WidgetScore ${widgetScore.value} does not have exactly one widget.`);
         continue;
      }
      if (scoreQuads.length !== 1) {
         console.warn(`WidgetScore ${widgetScore.value} does not have exactly one score.`);
         continue;
      }
      const widget = widgetQuads[0].object;
      const score = parseFloat(scoreQuads[0].object.value);
      if (isNaN(score)) {
         console.warn(`WidgetScore ${widgetScore.value} has an invalid score value.`);
         continue;
      }

      // For each widgetScore, get all data graph shapes (shui:dataGraphShape) and shapes graph shapes (shui:shapesGraphShape)
      const dataGraphShapes = widgetScoringGraph.getQuads(widgetScore, SHUI("dataGraphShape"), null).map(quad => quad.object);
      const shapesGraphShapes = widgetScoringGraph.getQuads(widgetScore, SHUI("shapesGraphShape"), null).map(quad => quad.object);

      // WidgetScore is not applicable if we have to ignore data graph shapes and no shapesGraphShapes are defined
      if (ignoreDataGraphShapes && shapesGraphShapes.length === 0) {
         continue;
      }

      // Validate against data graph shapes and shapes graph shapes
      const dataValid = ignoreDataGraphShapes || await scoreValidation(focusNode, dataGraph, dataGraphShapes, widgetScoringGraph);
      const shapesValid = await scoreValidation(constraintShape, shapesGraph, shapesGraphShapes, widgetScoringGraph);

      if (!dataValid) {
         continue;
      }
      if (!shapesValid) {
         continue;
      }

      // If both validations pass, return the widget and its score
      results.push({
         widget: await toLabeledValue(widget, dataGraph, shapesGraph, dereferenceForLabelResolution),
         source: widgetScore.value,
         score: score,
      });
   }

   // A score of -1 blacklists a widget: drop every result (including the -1 rows
   // themselves) whose widget IRI was blacklisted. Compare by IRI, not object
   // identity — each result carries its own freshly built LabeledValue.
   const blacklistedWidgetIris = new Set(
      results.filter(r => r.score === -1).map(r => r.widget.value.value),
   );
   if (blacklistedWidgetIris.size > 0) {
      results = results.filter(r => !blacklistedWidgetIris.has(r.widget.value.value));
   }

   // Sort results in descending order by score value.
   // If two widgets have the same score, order them by widget IRI lexicographically.
   results.sort((a, b) => {
      if (b.score !== a.score) {
         return b.score - a.score;
      }
      return a.widget.value.value.localeCompare(b.widget.value.value);
   });

   // Filter out duplicate widgets, keeping only the one with the highest score (which should be the first one due to sorting)
   const seenWidgets = new Set<string>();
   results = results.filter(r => {
      if (seenWidgets.has(r.widget.value.value)) {
         return false;
      }
      seenWidgets.add(r.widget.value.value);
      return true;
   });
   return results;
}

async function scoreValidation(focusNode: Term, targetGraph: RdfStore, shapes: Term[], shapesGraph: RdfStore): Promise<boolean> {
   if (shapes.length === 0) {
      return true;
   }
   if (!focusNode) {
      return false;
   }
   // Check if focusNode exists in targetGraph
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
      return false;
   }
}
