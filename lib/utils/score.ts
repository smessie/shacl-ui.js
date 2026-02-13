import type {Term} from "@rdfjs/types";
import type {RdfStore} from "rdf-stores";
import type {UIComponent, WidgetScore} from "./types.ts";
import {RDF, SHUI, shui, xsd} from "./namespaces.ts";
// @ts-ignore
import {Validator} from "shacl-engine";
import {DataFactory} from "rdf-data-factory";
import * as RDFJS from 'rdf-js';

const df: RDFJS.DataFactory = new DataFactory();

export async function score(focusNode: Term | null, dataGraph: RdfStore, constraintShape: Term, shapesGraph: RdfStore, widgetScoringGraph: RdfStore): Promise<WidgetScore[]> {
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
         widget: widget.value,
         source: widgetScore.value,
         score: score,
      });
   }

   // Find any -1 scores, and remove all other scores with the same widget IRI
   const negativeScores = results.filter(r => r.score === -1).map(r => r.widget);
   if (negativeScores.length > 0) {
      for (const widget of negativeScores) {
         results = results.filter(r => r.widget !== widget);
      }
   }

   // Sort results in descending order by score value.
   // If two widgets have the same score, order them by widget IRI lexicographically.
   results.sort((a, b) => {
      if (b.score !== a.score) {
         return b.score - a.score;
      }
      return a.widget.localeCompare(b.widget);
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
      for (const shape of shapes) {
         const validator = new Validator(shapesGraph.asDataset(), {factory: df});
         const validationResult = await validator.validate({
            dataset: targetGraph.asDataset(),
            terms: [focusNode]
         }, [{terms: [shape]}]);
         if (!validationResult.conforms) {
            return false;
         }
      }
      return true;
   } catch (error) {
      return false;
   }
}

export function scoreHardcoded(uiComponent: UIComponent): WidgetScore[] {
   // Skip the scoring function for now
   const widgets: WidgetScore[] = [];
   if (uiComponent.datatype === xsd("string") && uiComponent.singleLine !== false) {
      widgets.push(...[
         {
            widget: shui("TextFieldEditor"),
            source: shui("TextFieldEditorScore10"),
            score: 10
         },
         {
            widget: shui("TextFieldWithLangEditor"),
            source: shui("TextFieldWithLangEditorScore1"),
            score: 1
         },
      ]);
   }
   if (uiComponent.datatype === xsd("string") && uiComponent.singleLine !== true) {
      widgets.push(...[{
         widget: shui("TextAreaEditor"),
         source: shui("TextAreaEditorScore10"),
         score: 10
      }, {
         widget: shui("TextAreaWithLangEditor"),
         source: shui("TextAreaWithLangEditorScore1"),
         score: 1
      }]);
   }
   if (uiComponent.datatype === xsd("boolean")) {
      widgets.push({
         widget: shui("BooleanSelectEditor"),
         source: shui("BooleanSelectEditorScore10"),
         score: 10
      });
   }
   if (uiComponent.datatype === xsd("integer")) {
      widgets.push({
         widget: shui("NumberFieldEditor"),
         source: shui("NumberFieldEditorScore10"),
         score: 10
      });
   }
   if (uiComponent.datatype === xsd("date")) {
      widgets.push(
         {
            widget: shui("DatePickerEditor"),
            source: shui("DatePickerEditorScore10"),
            score: 10
         });
   }
   if (uiComponent.datatype === xsd("dateTime")) {
      widgets.push(
         {
            widget: shui("DateTimePickerEditor"),
            source: shui("DateTimePickerEditorScore10"),
            score: 10
         });
   }
   if (uiComponent.options && uiComponent.options.length > 0) {
      widgets.push(
         {
            widget: shui("EnumSelectEditor"),
            source: shui("EnumSelectEditorScore40"),
            score: 40
         });
   }

   // Always add a TextFieldEditor with score 0 as a fallback option
   widgets.push(
      {
         widget: shui("TextFieldEditor"),
         source: shui("TextFieldEditorScore0"),
         score: 0
      }
   );

   // Select the highest scoring widget
   widgets.sort((a, b) => b.score - a.score);

   return widgets;
}
