import {RdfStore} from "rdf-stores";
import {DataFactory} from "rdf-data-factory";
import type {Quad, Quad_Object, Quad_Subject} from "rdf-js";
import * as RDF from 'rdf-js';
import type {NamedNode, Term} from "@rdfjs/types";
import type {LabeledValue, Path, UIComponent, UIComponentValue, UIGroup} from "./types.ts";
import {DCTERMS, rdf, RDF as RDF_, RDFS, SCHEMA, SH, SKOS} from "./namespaces.ts";
import {score} from "./score.ts";
import {getDefaultTermForWidget} from "./widgets.ts";
import {cloneTerm} from "./rdf.ts";
import {rdfDereferencer} from "rdf-dereference";

const df: RDF.DataFactory = new DataFactory();

export async function constructUiComponents(shapesGraph: RdfStore, constraintShape: string, dataGraph: RdfStore, focusNode: Term | null | undefined, widgetScoringGraph: RdfStore): Promise<UIComponent[]> {
   const rootNode: NamedNode = df.namedNode(constraintShape);
   const elements: UIComponent[] = [];
   for (const uiProperty of shapesGraph.getQuads(rootNode, SH("property"), null)) {
      const pathQuads = shapesGraph.getQuads(uiProperty.object, SH("path"), null);
      if (pathQuads.length !== 1) {
         console.warn(`Expected exactly one sh:path for constraint ${uiProperty.object.value}, found ${pathQuads.length}, skipping path extraction for this constraint`);
         continue;
      }
      const paths = extractPaths(uiProperty.object, shapesGraph, pathQuads[0].object);

      if (!paths || paths.length === 0) {
         console.warn(`UI property ${uiProperty.object.value} does not have a valid path, skipping`);
         continue;
      }

      const label = shapesGraph.getQuads(uiProperty.object, SH("name"), null)[0]?.object;
      const description = shapesGraph.getQuads(uiProperty.object, SH("description"), null)[0]?.object;
      const datatype = shapesGraph.getQuads(uiProperty.object, SH("datatype"), null)[0]?.object;
      const minCount = shapesGraph.getQuads(uiProperty.object, SH("minCount"), null)[0]?.object;
      const maxCount = shapesGraph.getQuads(uiProperty.object, SH("maxCount"), null)[0]?.object;
      const clazz = shapesGraph.getQuads(uiProperty.object, SH("class"), null)[0]?.object;
      const node = shapesGraph.getQuads(uiProperty.object, SH("node"), null)[0]?.object;
      const propertiesLength = shapesGraph.getQuads(uiProperty.object, SH("property"), null).length;
      const defaultChild: UIComponent[] | undefined = node ? await constructUiComponents(shapesGraph, node.value, dataGraph, null, widgetScoringGraph) :
         (propertiesLength > 0 ? await constructUiComponents(shapesGraph, uiProperty.object.value, dataGraph, null, widgetScoringGraph) : undefined);
      const pattern = shapesGraph.getQuads(uiProperty.object, SH("pattern"), null)[0]?.object.value;
      const minInclusive = shapesGraph.getQuads(uiProperty.object, SH("minInclusive"), null)[0]?.object.value;
      const maxInclusive = shapesGraph.getQuads(uiProperty.object, SH("maxInclusive"), null)[0]?.object.value;
      const order = shapesGraph.getQuads(uiProperty.object, SH("order"), null)[0]?.object.value;

      let values: UIComponentValue[] = [];
      let children: UIComponent[][] | undefined = undefined;
      for (const path of paths) {
         if (path.type !== "predicate" && path.type !== "inverse") {
            console.warn(`Unsupported path type ${path.type} for constraint ${uiProperty.object.value}, skipping value extraction for this path`);
            continue;
         }

         const pathValues = path.type === "predicate"
            ? (focusNode ? dataGraph.getQuads(focusNode, df.namedNode(path.path), null).map(quad => quad.object) : [])
            : (focusNode ? dataGraph.getQuads(null, df.namedNode(path.path), focusNode).map(quad => quad.subject) : []);

         if (node) {
            // If sh:node is present, we need to recursively construct UI components for the nested shape
            const nestedComponents = await Promise.all(pathValues.map(async (value) => constructUiComponents(shapesGraph, node.value, dataGraph, value, widgetScoringGraph)));
            children = [...(children ?? []), ...nestedComponents];
         }
         // Also consider child properties defined directly on the PropertyShape.
         if (propertiesLength > 0) {
            const directChildren = await Promise.all(pathValues.map(async (value) => constructUiComponents(shapesGraph, uiProperty.object.value, dataGraph, value, widgetScoringGraph)));
            children = [...(children ?? []), ...directChildren];
         }

         pathValues.forEach(value => {
            values.push({
               value: cloneTerm(value),
               path: path,
            });
         });
      }

      let instances: LabeledValue[] | undefined = undefined;
      if (clazz) {
         instances = await Promise.all(dataGraph.getQuads(null, RDF_("type"), clazz).map(async (quad) => await toLabeledValue(quad.subject, dataGraph, shapesGraph)));
      }

      const element: UIComponent = {
         iri: cloneTerm(uiProperty.object),
         focusNode: focusNode ? cloneTerm(focusNode) : undefined,
         paths: paths,
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
         order: order ? parseFloat(order) : undefined,
      }

      // Check if sh:in is present for enumerations, and if so, get all options
      const inQuad = shapesGraph.getQuads(uiProperty.object, SH("in"), null)[0];
      if (inQuad) {
         element.options = await Promise.all(extractEnumOptions(inQuad, shapesGraph).map(async (option) => {
            if (option.termType === "NamedNode" || option.termType === "BlankNode") {
               return await toLabeledValue(option, dataGraph, shapesGraph);
            } else {
               return {
                  value: cloneTerm(option),
                  label: option.value,
               };
            }
         }));
      }

      // Check if sh:group is present for grouping, and if so, extract group information
      const groupQuad = shapesGraph.getQuads(uiProperty.object, SH("group"), null)[0];
      if (groupQuad) {
         element.group = extractGroup(groupQuad, shapesGraph);
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
         element.values.push({value: getDefaultTermForWidget(element.defaultWidget, element), path: paths[0]})
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

   // Sort elements first by their group order (if they have a group), then by their own order value, with elements without an order value coming last.
   return elements.sort((a, b) => {
      if (a.group?.order !== undefined && b.group?.order !== undefined) {
         if (a.group.order !== b.group.order) {
            return a.group.order - b.group.order;
         } else {
            // If group order is the same, sort by element order
            if (a.order !== undefined && b.order !== undefined) {
               return a.order - b.order;
            } else if (a.order !== undefined) {
               return -1;
            } else {
               return 1;
            }
         }
      } else if (a.group?.order !== undefined) {
         return -1;
      } else if (b.group?.order !== undefined) {
         return 1;
      } else {
         // If neither has a group order, sort by element order
         if (a.order !== undefined && b.order !== undefined) {
            return a.order - b.order;
         } else if (a.order !== undefined) {
            return -1;
         } else {
            return 1;
         }
      }
   });
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

function extractPaths(constraintNode: Term, shapesGraph: RdfStore<any, Quad>, pathObject: Quad_Object): Path[] {
   if (pathObject.termType === "NamedNode") {
      return [{path: pathObject.value, type: "predicate"}];
   }
   if (pathObject.termType === "BlankNode") {
      const inversePathQuad = shapesGraph.getQuads(pathObject, SH("inversePath"), null)[0];
      if (inversePathQuad && inversePathQuad.object.termType === "NamedNode") {
         return [{path: inversePathQuad.object.value, type: "inverse"}];
      }
      const alternativePathQuad = shapesGraph.getQuads(pathObject, SH("alternativePath"), null)[0];
      if (alternativePathQuad) {
         const alternativePaths = extractAlternativePaths(alternativePathQuad.object, shapesGraph);
         return alternativePaths.map(alternativePathQuadObject => extractPaths(constraintNode, shapesGraph, alternativePathQuadObject)).flat();
      }
      console.warn(`Unsupported blank node path for constraint ${constraintNode.value}, skipping path extraction for this constraint`);
      return [];
   }
   console.warn(`Unsupported path type ${pathObject.termType} for constraint ${constraintNode.value}, skipping path extraction for this constraint`);
   return [];
}

function extractAlternativePaths(alternativePathNode: Term, shapesGraph: RdfStore<any, Quad>): Quad_Object[] {
   const paths: Quad_Object[] = [];
   let currentNode = alternativePathNode;
   while (currentNode.value !== rdf("nil")) {
      const firstQuad = shapesGraph.getQuads(currentNode, RDF_("first"), null)[0];
      if (firstQuad && firstQuad.object.termType === "NamedNode") {
         paths.push(firstQuad.object);
      }
      const restQuad = shapesGraph.getQuads(currentNode, RDF_("rest"), null)[0];
      if (restQuad) {
         currentNode = restQuad.object;
      } else {
         break;
      }
   }
   return paths;
}

function extractGroup(groupQuad: Quad, shapesGraph: RdfStore<any, Quad>): UIGroup {
   const groupNode = groupQuad.object;
   const labelQuad = shapesGraph.getQuads(groupNode, RDFS("label"), null)[0]
      || shapesGraph.getQuads(groupNode, DCTERMS("title"), null)[0]
      || shapesGraph.getQuads(groupNode, SKOS("prefLabel"), null)[0]
      || shapesGraph.getQuads(groupNode, SCHEMA("name"), null)[0];
   const order = shapesGraph.getQuads(groupNode, SH("order"), null)[0]?.object.value;

   return {
      iri: cloneTerm(groupNode),
      label: labelQuad?.object.value,
      order: order ? parseFloat(order) : undefined,
   }
}

export function uiComponentsToQuads(uiComponents: UIComponent[]): Quad[] {
   const quads = [];
   for (const component of uiComponents) {
      for (const value of component.values) {
         if (value.path.type === "predicate") {
            quads.push(df.quad(component.focusNode as Quad_Subject, df.namedNode(value.path.path), value.value as Quad_Object));
         } else if (value.path.type === "inverse") {
            quads.push(df.quad(value.value as Quad_Subject, df.namedNode(value.path.path), component.focusNode as Quad_Object));
         } else {
            console.warn(`Unsupported path type ${value.path.type} for component ${component.iri.value}, skipping quad generation for this component`);
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

async function toLabeledValue(term: Term, dataGraph: RdfStore, shapesGraph: RdfStore): Promise<LabeledValue> {
   let labelQuad = dataGraph.getQuads(term, RDFS("label"), null)[0]
      || dataGraph.getQuads(term, DCTERMS("title"), null)[0]
      || dataGraph.getQuads(term, SKOS("prefLabel"), null)[0]
      || dataGraph.getQuads(term, SCHEMA("name"), null)[0]
      // Or try to retrieve label from shapes graph if not found in data graph.
      || shapesGraph.getQuads(term, RDFS("label"), null)[0]
      || shapesGraph.getQuads(term, DCTERMS("title"), null)[0]
      || shapesGraph.getQuads(term, SKOS("prefLabel"), null)[0]
      || shapesGraph.getQuads(term, SCHEMA("name"), null)[0];

   let descriptionQuad = dataGraph.getQuads(term, RDFS("comment"), null)[0]
      || dataGraph.getQuads(term, DCTERMS("description"), null)[0]
      // Or try to retrieve description from shapes graph if not found in data graph.
      || shapesGraph.getQuads(term, RDFS("comment"), null)[0]
      || shapesGraph.getQuads(term, DCTERMS("description"), null)[0];

   // If still no label found, we will try to dereference the term and try to get the label from the dereferenced graph.
   if ((!labelQuad || !descriptionQuad) && term.termType === "NamedNode") {
      try {
         const dereferencedGraph = RdfStore.createDefault();
         const dereferencedOutput = await rdfDereferencer.dereference(term.value);
         await new Promise((resolve, reject) => {
            dereferencedGraph.import(dereferencedOutput.data).on("end", resolve).on("error", reject);
         });
         if (!labelQuad) {
            labelQuad = dereferencedGraph.getQuads(term, RDFS("label"), null)[0]
               || dereferencedGraph.getQuads(term, DCTERMS("title"), null)[0]
               || dereferencedGraph.getQuads(term, SKOS("prefLabel"), null)[0]
               || dereferencedGraph.getQuads(term, SCHEMA("name"), null)[0];
         }
         if (!descriptionQuad) {
            descriptionQuad = dereferencedGraph.getQuads(term, RDFS("comment"), null)[0]
               || dereferencedGraph.getQuads(term, DCTERMS("description"), null)[0];
         }
      } catch (error) {
         // Ignore dereferencing errors.
      }
   }

   return {
      value: cloneTerm(term),
      label: labelQuad ? labelQuad.object.value : term.value,
      description: descriptionQuad ? descriptionQuad.object.value : undefined,
   }
}
