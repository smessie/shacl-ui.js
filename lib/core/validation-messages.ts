/**
 * User-facing wording for SHACL validation results.
 *
 * `shacl-engine`'s built-in messages are written for RDF authors: they quote terms in Turtle
 * syntax (`"0"^^<http://www.w3.org/2001/XMLSchema#integer>`) and name constraint components
 * rather than saying what the person filling in the form should do. This module derives a short
 * instruction from the constraint component and its parameter on the source shape instead.
 *
 * An `sh:message` on the shape always wins over anything produced here (see `validation.ts`);
 * these messages are only used when the shapes graph provides none.
 */
import type {Term} from "@rdfjs/types";
import type {RdfStore} from "rdf-stores";
import {localNameResolution, selectByLanguage} from "./labels.ts";
import {RDFS, SH, XSD} from "./namespaces.ts";
import {extractShaclList} from "./rdf-list.ts";

/** Everyday names for the XSD datatypes people actually type into forms. */
const DATATYPE_PHRASES: Record<string, string> = {
   [XSD("dateTime").value]: "date and time",
   [XSD("dateTimeStamp").value]: "date and time",
   [XSD("date").value]: "date",
   [XSD("time").value]: "time",
   [XSD("gYear").value]: "year",
   [XSD("gYearMonth").value]: "year and month",
   [XSD("duration").value]: "duration",
   [XSD("integer").value]: "whole number",
   [XSD("int").value]: "whole number",
   [XSD("long").value]: "whole number",
   [XSD("short").value]: "whole number",
   [XSD("byte").value]: "whole number",
   [XSD("nonNegativeInteger").value]: "whole number of 0 or more",
   [XSD("positiveInteger").value]: "whole number greater than 0",
   [XSD("nonPositiveInteger").value]: "whole number of 0 or less",
   [XSD("negativeInteger").value]: "whole number less than 0",
   [XSD("decimal").value]: "number",
   [XSD("float").value]: "number",
   [XSD("double").value]: "number",
   [XSD("boolean").value]: "yes or no value",
   [XSD("string").value]: "text value",
   [XSD("normalizedString").value]: "text value",
   [XSD("token").value]: "text value",
   [XSD("anyURI").value]: "URL",
};

/** Everyday names for the `sh:nodeKind` values. */
const NODE_KIND_PHRASES: Record<string, string> = {
   [SH("IRI").value]: "link (IRI)",
   [SH("Literal").value]: "plain value",
   [SH("BlankNode").value]: "nested value",
   [SH("IRIOrLiteral").value]: "link (IRI) or plain value",
   [SH("BlankNodeOrIRI").value]: "link (IRI) or nested value",
   [SH("BlankNodeOrLiteral").value]: "plain value or nested value",
};

function plural(count: string, singular: string): string {
   return count === "1" ? singular : `${singular}s`;
}

/**
 * Human-readable text for a term used inside a message: the lexical value of a literal (without
 * its datatype or language tag), and the label — or failing that the local name — of an IRI.
 */
function termText(term: Term, shapesStore: RdfStore, languages: string[]): string {
   if (term.termType === "Literal") return term.value;
   if (term.termType !== "NamedNode") return "this value";
   const label = selectByLanguage(shapesStore.getQuads(term, RDFS("label"), null), {preferredLanguages: languages});
   return label?.value ?? localNameResolution(term.value);
}

/**
 * Derives a short, user-facing instruction for a validation result from its constraint component
 * and the corresponding constraint parameter on its source shape.
 *
 * @returns `undefined` when no better wording can be derived (unknown constraint component, or a
 *   source shape that does not carry the parameter), so the caller can fall back.
 */
export function friendlyMessage(
   sourceConstraintComponent: string | undefined,
   sourceShape: Term | undefined,
   shapesStore: RdfStore,
   languages: string[] = [],
): string | undefined {
   if (!sourceConstraintComponent) return undefined;
   const component = sourceConstraintComponent.split(/[#/]/).pop() ?? "";

   /** First value of constraint parameter `name` on the source shape. */
   const parameter = (name: string): Term | undefined =>
      sourceShape ? shapesStore.getQuads(sourceShape, SH(name), null)[0]?.object : undefined;
   const text = (term: Term) => termText(term, shapesStore, languages);
   const listText = (name: string): string | undefined => {
      const list = parameter(name);
      if (!list) return undefined;
      const members = extractShaclList(list, shapesStore as never);
      return members.length > 0 ? members.map(text).join(", ") : undefined;
   };
   /** Applies `format` to the parameter's value, or gives up when the shape has no such value. */
   const withParameter = (name: string, format: (value: Term) => string): string | undefined => {
      const value = parameter(name);
      return value ? format(value) : undefined;
   };

   switch (component) {
      case "DatatypeConstraintComponent":
         return withParameter("datatype", datatype =>
            `Enter a valid ${DATATYPE_PHRASES[datatype.value] ?? `${localNameResolution(datatype.value).toLowerCase()} value`}.`);
      case "NodeKindConstraintComponent":
         return withParameter("nodeKind", nodeKind =>
            `Enter a valid ${NODE_KIND_PHRASES[nodeKind.value] ?? "value"}.`);
      case "ClassConstraintComponent":
         return withParameter("class", clazz => `Enter a valid ${text(clazz)}.`);

      case "MinCountConstraintComponent":
         return withParameter("minCount", count =>
            count.value === "1" ? "This field is required." : `Enter at least ${count.value} values.`);
      case "MaxCountConstraintComponent":
         return withParameter("maxCount", count =>
            count.value === "1" ? "Only one value is allowed." : `Enter at most ${count.value} values.`);

      case "MinInclusiveConstraintComponent":
         return withParameter("minInclusive", min => `Enter a value of ${text(min)} or more.`);
      case "MaxInclusiveConstraintComponent":
         return withParameter("maxInclusive", max => `Enter a value of ${text(max)} or less.`);
      case "MinExclusiveConstraintComponent":
         return withParameter("minExclusive", min => `Enter a value greater than ${text(min)}.`);
      case "MaxExclusiveConstraintComponent":
         return withParameter("maxExclusive", max => `Enter a value less than ${text(max)}.`);

      case "MinLengthConstraintComponent":
         return withParameter("minLength", min =>
            `Enter at least ${min.value} ${plural(min.value, "character")}.`);
      case "MaxLengthConstraintComponent":
         return withParameter("maxLength", max =>
            `Enter at most ${max.value} ${plural(max.value, "character")}.`);
      case "PatternConstraintComponent":
         return "Enter a value in the required format.";

      case "InConstraintComponent": {
         const options = listText("in");
         return options ? `Choose one of: ${options}.` : undefined;
      }
      case "HasValueConstraintComponent":
         return withParameter("hasValue", value => `The value ${text(value)} is required.`);
      case "LanguageInConstraintComponent": {
         const langs = listText("languageIn");
         return langs ? `Use one of these languages: ${langs}.` : undefined;
      }
      case "UniqueLangConstraintComponent":
         return "Enter only one value per language.";

      case "EqualsConstraintComponent":
         return withParameter("equals", other => `Enter the same value as ${text(other)}.`);
      case "DisjointConstraintComponent":
         return withParameter("disjoint", other => `Enter a different value than ${text(other)}.`);
      case "LessThanConstraintComponent":
         return withParameter("lessThan", other => `Enter a value lower than ${text(other)}.`);
      case "LessThanOrEqualsConstraintComponent":
         return withParameter("lessThanOrEquals", other => `Enter a value not higher than ${text(other)}.`);

      case "ClosedConstraintComponent":
         return "This property is not allowed here.";
      case "NotConstraintComponent":
         return "This value is not allowed.";
      case "OrConstraintComponent":
      case "XoneConstraintComponent":
         return "This value does not match any of the allowed options.";
      case "AndConstraintComponent":
      case "NodeConstraintComponent":
      case "PropertyConstraintComponent":
         return "This value does not meet all requirements.";
      case "QualifiedMinCountConstraintComponent":
         return withParameter("qualifiedMinCount", count => `Enter at least ${count.value} matching values.`);
      case "QualifiedMaxCountConstraintComponent":
         return withParameter("qualifiedMaxCount", count => `Enter at most ${count.value} matching values.`);
      default:
         return undefined;
   }
}

