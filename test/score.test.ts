import {describe, expect, it} from "vitest";
import {parseRdf} from "../lib/core/rdf.ts";
import {score} from "../lib/core/score.ts";
import {SH} from "../lib/core/namespaces.ts";
import {DataFactory} from "rdf-data-factory";

const df = new DataFactory();

const EMPTY = () => parseRdf("", "text/turtle");

/** A widget-scoring graph with two unconditional scores for the same widget. */
const SUPPRESSED = `@prefix shui: <http://www.w3.org/ns/shacl-ui/> .
@prefix ex: <http://example.org/> .
ex:ws1 a shui:WidgetScore ; shui:widget shui:TextField ; shui:score 5 .
ex:ws2 a shui:WidgetScore ; shui:widget shui:TextField ; shui:score -1 .`;

/** Two distinct widgets, both unconditional, with different positive scores. */
const TWO_WIDGETS = `@prefix shui: <http://www.w3.org/ns/shacl-ui/> .
@prefix ex: <http://example.org/> .
ex:ws1 a shui:WidgetScore ; shui:widget shui:TextField ; shui:score 2 .
ex:ws2 a shui:WidgetScore ; shui:widget shui:TextArea ; shui:score 9 .`;

/** Same widget scored twice (both positive) — should be de-duplicated to the highest. */
const DUPLICATE = `@prefix shui: <http://www.w3.org/ns/shacl-ui/> .
@prefix ex: <http://example.org/> .
ex:ws1 a shui:WidgetScore ; shui:widget shui:TextField ; shui:score 3 .
ex:ws2 a shui:WidgetScore ; shui:widget shui:TextField ; shui:score 7 .`;

const shape = SH("PropertyShape"); // any term works; no shape conditions are attached
// Unconditional widget scores only apply when a focus node is present (otherwise the
// engine skips scores that have no shapesGraphShape). Use any focus node.
const focusNode = df.namedNode("http://example.org/alice");

describe("score()", () => {
   it("ranks widgets by descending score", async () => {
      const widgetScoring = await parseRdf(TWO_WIDGETS, "text/turtle");
      const results = await score(focusNode, await EMPTY(), shape, await EMPTY(), widgetScoring, false);
      expect(results.map(r => r.widget.value.value)).toEqual([
         "http://www.w3.org/ns/shacl-ui/TextArea",
         "http://www.w3.org/ns/shacl-ui/TextField",
      ]);
   });

   it("de-duplicates a widget to its highest score", async () => {
      const widgetScoring = await parseRdf(DUPLICATE, "text/turtle");
      const results = await score(focusNode, await EMPTY(), shape, await EMPTY(), widgetScoring, false);
      const textFields = results.filter(r => r.widget.value.value.endsWith("TextField"));
      expect(textFields).toHaveLength(1);
      expect(textFields[0].score).toBe(7);
   });

   // Intended behavior: a score of -1 blacklists the widget entirely, removing ALL
   // (including positive) scores for the same widget IRI. Currently broken (RED).
   it("suppresses a widget entirely when any score for it is -1", async () => {
      const widgetScoring = await parseRdf(SUPPRESSED, "text/turtle");
      const results = await score(focusNode, await EMPTY(), shape, await EMPTY(), widgetScoring, false);
      expect(results.find(r => r.widget.value.value.endsWith("TextField"))).toBeUndefined();
   });

   it("ignores widget scores that depend on data-graph shapes when there is no focus node", async () => {
      const widgetScoring = await parseRdf(
         `@prefix shui: <http://www.w3.org/ns/shacl-ui/> .
          @prefix ex: <http://example.org/> .
          ex:ws a shui:WidgetScore ; shui:widget shui:TextField ; shui:score 5 ;
                shui:dataGraphShape ex:someShape .`,
         "text/turtle",
      );
      const results = await score(null, await EMPTY(), df.namedNode("http://example.org/s"), await EMPTY(), widgetScoring, false);
      expect(results).toHaveLength(0);
   });
});
