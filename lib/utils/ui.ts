import type {RdfStore} from "rdf-stores";
import {DataFactory} from "rdf-data-factory";
import type {Quad, Quad_Object, Quad_Subject} from "rdf-js";
import * as RDF from 'rdf-js';
import type {NamedNode, Term} from "@rdfjs/types";
import type {LabeledValue, PathType, UIComponent, UIComponentValue} from "./types.ts";
import {DCTERMS, rdf, RDF as RDF_, RDFS, SH} from "./namespaces.ts";
import {score} from "./score.ts";
import {getDefaultTermForWidget} from "./widgets.ts";
import {cloneTerm} from "./rdf.ts";

const df: RDF.DataFactory = new DataFactory();

export async function constructUiComponents(shapesGraph: RdfStore, constraintShape: string, dataGraph: RdfStore, focusNode: Term | null | undefined, widgetScoringGraph: RdfStore): Promise<UIComponent[]> {
   const rootNode: NamedNode = df.namedNode(constraintShape);
   const elements: UIComponent[] = [];
   for (const uiProperty of shapesGraph.getQuads(rootNode, SH("property"), null)) {
      let path = shapesGraph.getQuads(uiProperty.object, SH("path"), null)[0]?.object;
      let pathType: PathType;
      if (!path) {
         console.warn(`UI property ${uiProperty.object.value} is missing a path, skipping`);
         continue;
      }
      if (path.termType === "NamedNode") {
         pathType = "predicate";
      } else if (path.termType === "BlankNode") {
         // Check if it's an inverse path (sh:inversePath)
         const inversePathQuad = shapesGraph.getQuads(path, SH("inversePath"), null)[0];
         if (inversePathQuad && inversePathQuad.object.termType === "NamedNode") {
            pathType = "inverse";
            path = inversePathQuad.object;
         } else {
            console.warn(`UI property ${uiProperty.object.value} has a blank node path that is not an inverse path, skipping`);
            continue;
         }
      } else {
         console.warn(`UI property ${uiProperty.object.value} has an unsupported path type (${path.termType}), skipping`);
         continue;
      }
      const label = shapesGraph.getQuads(uiProperty.object, SH("name"), null)[0]?.object;
      const description = shapesGraph.getQuads(uiProperty.object, SH("description"), null)[0]?.object;
      const datatype = shapesGraph.getQuads(uiProperty.object, SH("datatype"), null)[0]?.object;
      const minCount = shapesGraph.getQuads(uiProperty.object, SH("minCount"), null)[0]?.object;
      const maxCount = shapesGraph.getQuads(uiProperty.object, SH("maxCount"), null)[0]?.object;
      const clazz = shapesGraph.getQuads(uiProperty.object, SH("class"), null)[0]?.object;
      const node = shapesGraph.getQuads(uiProperty.object, SH("node"), null)[0]?.object;
      const defaultChild: UIComponent[] | undefined = node ? await constructUiComponents(shapesGraph, node.value, dataGraph, null, widgetScoringGraph) : undefined;
      const pattern = shapesGraph.getQuads(uiProperty.object, SH("pattern"), null)[0]?.object.value;
      const minInclusive = shapesGraph.getQuads(uiProperty.object, SH("minInclusive"), null)[0]?.object.value;
      const maxInclusive = shapesGraph.getQuads(uiProperty.object, SH("maxInclusive"), null)[0]?.object.value;

      let values: UIComponentValue[] = [];
      let children: UIComponent[][] | undefined = undefined;
      if (pathType === "predicate") {
         const pathValues = path && focusNode ? dataGraph.getQuads(focusNode, df.namedNode(path.value), null).map(quad => quad.object) : [];
         if (node) {
            // If sh:node is present, we need to recursively construct UI components for the nested shape
            children = await Promise.all(pathValues.map(async (object) => constructUiComponents(shapesGraph, node.value, dataGraph, object, widgetScoringGraph)));
         }
         values = pathValues.map(object => ({value: cloneTerm(object)}));
      } else if (pathType === "inverse") {
         const pathValues = path && focusNode ? dataGraph.getQuads(null, df.namedNode(path.value), focusNode).map(quad => quad.subject) : [];
         if (node) {
            // If sh:node is present, we need to recursively construct UI components for the nested shape
            children = await Promise.all(pathValues.map(async (subject) => constructUiComponents(shapesGraph, node.value, dataGraph, subject, widgetScoringGraph)));
         }
         values = pathValues.map(subject => ({value: cloneTerm(subject)}));
      }

      let instances: LabeledValue[] | undefined = undefined;
      if (clazz) {
         instances = dataGraph.getQuads(null, RDF_("type"), clazz).map(quad => toLabeledValue(quad.subject, dataGraph));
      }

      const element: UIComponent = {
         iri: cloneTerm(uiProperty.object),
         focusNode: focusNode ? cloneTerm(focusNode) : undefined,
         path: path?.value,
         pathType: pathType,
         node: cloneTerm(node),
         label: label?.value,
         description: description?.value,
         datatype: datatype?.value,
         values: values,
         children: children,
         defaultChild: defaultChild,
         minCount: minCount ? parseInt(minCount.value) : undefined,
         maxCount: maxCount ? parseInt(maxCount.value) : undefined,
         class: cloneTerm(clazz),
         instances: instances,
         pattern: pattern,
         minInclusive: minInclusive,
         maxInclusive: maxInclusive,
      }

      // Check if sh:in is present for enumerations, and if so, get all options
      const inQuad = shapesGraph.getQuads(uiProperty.object, SH("in"), null)[0];
      if (inQuad) {
         element.options = extractEnumOptions(inQuad, shapesGraph);
      }

      // Check if sh:singleLine is present
      const singleLineQuad = shapesGraph.getQuads(uiProperty.object, SH("singleLine"), null)[0];
      if (singleLineQuad) {
         element.singleLine = singleLineQuad.object.value === "true" || singleLineQuad.object.value === "1";
      }

      // Configure default widget based on the shape only.
      element.defaultWidget = (await score(null, dataGraph, uiProperty.object, shapesGraph, widgetScoringGraph))[0]?.widget;

      // Make sure we have at least minCount values, by adding empty values if needed.
      for (let i = values.length; i < (element.minCount ?? 0); i++) {
         element.values.push({value: getDefaultTermForWidget(element.defaultWidget, element)})
      }

      // Score all values of the component and attach a selectedWidget based on the highest scoring widget for each value.
      element.values = await Promise.all(element.values.map(async (value) => {
         const widgetScores = await score(value.value, dataGraph, uiProperty.object, shapesGraph, widgetScoringGraph);
         value.selectedWidget = widgetScores[0]?.widget;
         value.widgets = widgetScores;
         return value;
      }));

      elements.push(element);
   }
   return elements;
}

function extractEnumOptions(inQuad: Quad, shapesGraph: RdfStore<any, Quad>): Term[] {
   const listNode = inQuad.object;
   const options: Term[] = [];
   let currentNode = listNode;
   while (currentNode.value !== rdf("nil")) {
      const firstQuad = shapesGraph.getQuads(currentNode, RDF_("first"), null)[0];
      if (firstQuad) {
         options.push(cloneTerm(firstQuad.object));
      }
      const restQuad = shapesGraph.getQuads(currentNode, RDF_("rest"), null)[0];
      if (restQuad) {
         currentNode = restQuad.object;
      } else {
         break;
      }
   }
   return options;
}

export function uiComponentsToQuads(uiComponents: UIComponent[]): Quad[] {
   const quads = [];
   for (const component of uiComponents) {
      for (const value of component.values) {
         if (component.pathType === "predicate") {
            quads.push(df.quad(component.focusNode as Quad_Subject, df.namedNode(component.path), value.value as Quad_Object));
         } else if (component.pathType === "inverse") {
            quads.push(df.quad(value.value as Quad_Subject, df.namedNode(component.path), component.focusNode as Quad_Object));
         } else {
            console.warn(`Unsupported path type ${component.pathType} for component ${component.iri.value}, skipping quad generation for this component`);
         }
      }
      if (component.node && component.children) {
         for (const child of component.children) {
            quads.push(...uiComponentsToQuads(child));
         }
      }
   }
   return quads;
}

function toLabeledValue(term: Term, dataGraph: RdfStore): LabeledValue {
   const labelQuad = dataGraph.getQuads(term, RDFS("label"), null)[0] || dataGraph.getQuads(term, DCTERMS("title"), null)[0];
   const descriptionQuad = dataGraph.getQuads(term, RDFS("comment"), null)[0] || dataGraph.getQuads(term, DCTERMS("description"), null)[0];
   return {
      value: cloneTerm(term),
      label: labelQuad ? labelQuad.object.value : term.value,
      description: descriptionQuad ? descriptionQuad.object.value : undefined,
   }
}
