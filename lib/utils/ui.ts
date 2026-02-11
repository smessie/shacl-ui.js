import type {RdfStore} from "rdf-stores";
import {DataFactory} from "rdf-data-factory";
import type {Quad, Quad_Object} from "rdf-js";
import * as RDF from 'rdf-js';
import type {NamedNode, Term} from "@rdfjs/types";
import type {UIComponent, UIComponentValue} from "./types.ts";
import {rdf, RDF as RDF_, SH} from "./namespaces.ts";

const df: RDF.DataFactory = new DataFactory();

export function constructUiComponents(shapesGraph: RdfStore, constraintShape: string, dataGraph: RdfStore, focusNode: string): UIComponent[] {
   const rootNode: NamedNode = df.namedNode(constraintShape);
   const elements: UIComponent[] = [];
   for (const uiProperty of shapesGraph.getQuads(rootNode, SH("property"), null)) {
      // TODO: check if path is supported (currently only simple paths with a single predicate are supported, no inverses or complex paths)
      const path = shapesGraph.getQuads(uiProperty.object, SH("path"), null)[0]?.object;
      const label = shapesGraph.getQuads(uiProperty.object, SH("name"), null)[0]?.object;
      const description = shapesGraph.getQuads(uiProperty.object, SH("description"), null)[0]?.object;
      const datatype = shapesGraph.getQuads(uiProperty.object, SH("datatype"), null)[0]?.object;
      const minCount = shapesGraph.getQuads(uiProperty.object, SH("minCount"), null)[0]?.object;
      const maxCount = shapesGraph.getQuads(uiProperty.object, SH("maxCount"), null)[0]?.object;

      const values: UIComponentValue[] = path ? dataGraph.getQuads(df.namedNode(focusNode), df.namedNode(path.value), null).map(quad => ({value: quad.object})) : [];

      const element: UIComponent = {
         iri: uiProperty.object,
         path: path?.value,
         label: label?.value,
         description: description?.value,
         datatype: datatype?.value,
         values: values,
         minCount: minCount ? parseInt(minCount.value) : undefined,
         maxCount: maxCount ? parseInt(maxCount.value) : undefined,
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
         options.push(firstQuad.object);
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

export function uiComponentsToQuads(uiComponents: UIComponent[], focusNode: string): Quad[] {
   const subject = df.namedNode(focusNode);
   const quads = []
   for (const component of uiComponents) {
      for (const value of component.values) {
         quads.push(df.quad(subject, df.namedNode(component.path), value.value as Quad_Object));
      }
   }
   return quads;
}
