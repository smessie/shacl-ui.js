import {describe, expect, it} from "vitest";
import {parseRdf} from "../lib/core/rdf.ts";
import {acceptFunction, matcherFunction, score, scoreFunction, selectWidget} from "../lib/core/score.ts";
import {SH, SHUI} from "../lib/core/namespaces.ts";
import {DataFactory} from "rdf-data-factory";

const df = new DataFactory();

const EMPTY = () => parseRdf("", "text/turtle");
const TTL = (body: string) => parseRdf(
   `@prefix shui: <http://www.w3.org/ns/shacl-ui/> .
    @prefix sh: <http://www.w3.org/ns/shacl#> .
    @prefix ex: <http://example.org/> .
    ${body}`,
   "text/turtle",
);

/** Two distinct widgets, both unconditional, with different positive scores. */
const TWO_WIDGETS = `
ex:ws1 a shui:WidgetScore ; shui:widget shui:TextField ; shui:score 2 .
ex:ws2 a shui:WidgetScore ; shui:widget shui:TextArea ; shui:score 9 .`;

/** Same widget scored twice (both positive) — should be de-duplicated to the highest. */
const DUPLICATE = `
ex:ws1 a shui:WidgetScore ; shui:widget shui:TextField ; shui:score 3 .
ex:ws2 a shui:WidgetScore ; shui:widget shui:TextField ; shui:score 7 .`;

/** Two widgets with the same score — tie-broken by the Unicode codepoint of the widget IRI. */
const TIE = `
ex:ws1 a shui:WidgetScore ; shui:widget shui:TextField ; shui:score 5 .
ex:ws2 a shui:WidgetScore ; shui:widget shui:TextArea ; shui:score 5 .`;

const shape = SH("PropertyShape"); // any term works; no shape conditions are attached
const focusNode = df.namedNode("http://example.org/alice");

const iris = (results: {widget: {value: {value: string}}}[]) => results.map(r => r.widget.value.value);

describe("score()", () => {
   it("ranks widgets by descending score", async () => {
      const scoring = await TTL(TWO_WIDGETS);
      const results = await score(focusNode, await EMPTY(), shape, await EMPTY(), scoring, {});
      expect(iris(results)).toEqual([
         "http://www.w3.org/ns/shacl-ui/TextArea",
         "http://www.w3.org/ns/shacl-ui/TextField",
      ]);
   });

   it("de-duplicates a widget to its highest score", async () => {
      const scoring = await TTL(DUPLICATE);
      const results = await score(focusNode, await EMPTY(), shape, await EMPTY(), scoring, {});
      const textFields = results.filter(r => r.widget.value.value.endsWith("TextField"));
      expect(textFields).toHaveLength(1);
      expect(textFields[0].score).toBe(7);
   });

   it("breaks score ties by the Unicode codepoint of the widget IRI", async () => {
      const scoring = await TTL(TIE);
      const results = await score(focusNode, await EMPTY(), shape, await EMPTY(), scoring, {});
      expect(iris(results)).toEqual([
         "http://www.w3.org/ns/shacl-ui/TextArea",
         "http://www.w3.org/ns/shacl-ui/TextField",
      ]);
   });

   it("ignores widget scores that depend on data-graph shapes when there is no focus node", async () => {
      const scoring = await TTL(`ex:ws a shui:WidgetScore ; shui:widget shui:TextField ; shui:score 5 ;
                                    shui:dataGraphShape ex:someShape .`);
      const results = await score(null, await EMPTY(), df.namedNode("http://example.org/s"), await EMPTY(), scoring, {});
      expect(results).toHaveLength(0);
   });

   it("drops a widget vetoed by its WidgetAcceptMatcher, keeping the others", async () => {
      // TextArea outscores TextField but its accept matcher requires the property shape to conform
      // to an unsatisfiable shape (the shape node is absent from the empty shapes graph), so it is
      // rejected and TextField remains.
      const scoring = await TTL(`
         ex:ws1 a shui:WidgetScore ; shui:widget shui:TextField ; shui:score 5 .
         ex:ws2 a shui:WidgetScore ; shui:widget shui:TextArea ; shui:score 9 .
         ex:amArea a shui:WidgetAcceptMatcher ; shui:widget shui:TextArea ;
                   shui:shapesGraphShape ex:needsPath .
         ex:needsPath a sh:NodeShape ; sh:property [ sh:path sh:path ; sh:minCount 1 ] .`);
      const results = await score(focusNode, await EMPTY(), shape, await EMPTY(), scoring, {});
      expect(iris(results)).toEqual(["http://www.w3.org/ns/shacl-ui/TextField"]);
   });

   it("keeps a widget whose WidgetAcceptMatcher has no conditions", async () => {
      const scoring = await TTL(`
         ex:ws a shui:WidgetScore ; shui:widget shui:TextField ; shui:score 5 .
         ex:am a shui:WidgetAcceptMatcher ; shui:widget shui:TextField .`);
      const results = await score(focusNode, await EMPTY(), shape, await EMPTY(), scoring, {});
      expect(iris(results)).toEqual(["http://www.w3.org/ns/shacl-ui/TextField"]);
   });

   it("throws on a malformed WidgetScore (missing shui:score)", async () => {
      const scoring = await TTL(`ex:ws a shui:WidgetScore ; shui:widget shui:TextField .`);
      await expect(score(focusNode, await EMPTY(), shape, await EMPTY(), scoring, {})).rejects.toThrow(/Malformed/);
   });

   it("throws on a malformed WidgetScore (non-numeric shui:score)", async () => {
      const scoring = await TTL(`ex:ws a shui:WidgetScore ; shui:widget shui:TextField ; shui:score "big" .`);
      await expect(score(focusNode, await EMPTY(), shape, await EMPTY(), scoring, {})).rejects.toThrow(/not a number/);
   });

   it("throws when a mandatory input is missing", async () => {
      const scoring = await TTL(TWO_WIDGETS);
      // @ts-expect-error deliberately passing a missing shape node
      await expect(score(focusNode, await EMPTY(), null, await EMPTY(), scoring, {})).rejects.toThrow(/shape node/);
   });
});

describe("matcherFunction()", () => {
   it("matches when the property shape conforms to the shapesGraphShape", async () => {
      const shapesGraph = await TTL(`ex:shape sh:path ex:foo .`);
      const scoring = await TTL(`ex:needsPath a sh:NodeShape ; sh:property [ sh:path sh:path ; sh:minCount 1 ] .
                                 ex:matcher a shui:WidgetScore ; shui:widget shui:TextField ; shui:score 5 ;
                                            shui:shapesGraphShape ex:needsPath .`);
      const matched = await matcherFunction(
         focusNode, await EMPTY(), df.namedNode("http://example.org/shape"), shapesGraph, scoring,
         df.namedNode("http://example.org/matcher"),
      );
      expect(matched).toBe(true);
   });

   it("does not match when the property shape violates the shapesGraphShape", async () => {
      const scoring = await TTL(`ex:needsPath a sh:NodeShape ; sh:property [ sh:path sh:path ; sh:minCount 1 ] .
                                 ex:matcher a shui:WidgetScore ; shui:widget shui:TextField ; shui:score 5 ;
                                            shui:shapesGraphShape ex:needsPath .`);
      const matched = await matcherFunction(
         focusNode, await EMPTY(), df.namedNode("http://example.org/absent"), await EMPTY(), scoring,
         df.namedNode("http://example.org/matcher"),
      );
      expect(matched).toBe(false);
   });
});

describe("acceptFunction()", () => {
   it("accepts a widget that has no WidgetAcceptMatcher", async () => {
      const scoring = await TTL(TWO_WIDGETS);
      const accepted = await acceptFunction(focusNode, await EMPTY(), shape, await EMPTY(), SHUI("TextField"), scoring);
      expect(accepted).toBe(true);
   });

   it("rejects a widget whose WidgetAcceptMatcher does not match", async () => {
      const scoring = await TTL(`
         ex:am a shui:WidgetAcceptMatcher ; shui:widget shui:TextField ;
               shui:shapesGraphShape ex:needsPath .
         ex:needsPath a sh:NodeShape ; sh:property [ sh:path sh:path ; sh:minCount 1 ] .`);
      const accepted = await acceptFunction(focusNode, await EMPTY(), shape, await EMPTY(), SHUI("TextField"), scoring);
      expect(accepted).toBe(false);
   });
});

describe("selectWidget()", () => {
   it("returns the explicitly specified widget when it has no accept matcher", async () => {
      const shapesGraph = await TTL(`ex:shape shui:editor shui:CustomEditor .`);
      const scoring = await TTL(TWO_WIDGETS);
      const selected = await selectWidget(
         focusNode, await EMPTY(), df.namedNode("http://example.org/shape"), shapesGraph, scoring, SHUI("editor"),
      );
      expect(selected?.value).toBe("http://www.w3.org/ns/shacl-ui/CustomEditor");
   });

   it("falls through to scoring when the explicit widget is rejected by its accept matcher", async () => {
      const shapesGraph = await TTL(`ex:shape shui:editor shui:CustomEditor .`);
      const scoring = await TTL(`
         ex:ws a shui:WidgetScore ; shui:widget shui:TextField ; shui:score 5 .
         ex:am a shui:WidgetAcceptMatcher ; shui:widget shui:CustomEditor ;
               shui:shapesGraphShape ex:needsPath .
         ex:needsPath a sh:NodeShape ; sh:property [ sh:path sh:path ; sh:minCount 1 ] .`);
      const selected = await selectWidget(
         focusNode, await EMPTY(), df.namedNode("http://example.org/shape"), shapesGraph, scoring, SHUI("editor"),
      );
      expect(selected?.value).toBe("http://www.w3.org/ns/shacl-ui/TextField");
   });

   it("returns undefined when no widget is accepted", async () => {
      const scoring = await TTL(EMPTY_SCORING());
      const selected = await selectWidget(
         focusNode, await EMPTY(), shape, await EMPTY(), scoring, SHUI("editor"),
      );
      expect(selected).toBeUndefined();
   });
});

/** A scoring graph with no widget scores at all. */
function EMPTY_SCORING(): string {
   return `ex:placeholder a sh:NodeShape .`;
}

describe("scoreFunction()", () => {
   it("returns only the first match when best is true", async () => {
      const scoring = await TTL(TWO_WIDGETS);
      const matches = await scoreFunction(true, focusNode, await EMPTY(), shape, await EMPTY(), scoring);
      expect(matches).toHaveLength(1);
      expect(matches[0].widget.value).toBe("http://www.w3.org/ns/shacl-ui/TextArea");
   });
});
