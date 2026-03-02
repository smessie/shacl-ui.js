import {RdfStore} from "rdf-stores";
import {DataFactory} from "rdf-data-factory";
import type {Quad, Quad_Object, Quad_Subject} from "rdf-js";
import * as RDF from 'rdf-js';
import type {NamedNode, Term} from "@rdfjs/types";
import type {ClassValue, LabeledValue, Path, UIComponent, UIComponentValue, UIGroup} from "./types.ts";
import {DCTERMS, rdf, RDF as RDF_, RDFS, SCHEMA, SH, shui, SKOS} from "./namespaces.ts";
import {score} from "./score.ts";
import {getDefaultTermForWidget} from "./widgets.ts";
import {rdfDereferencer} from "rdf-dereference";
import {ShaclRenderer} from "../shacl-renderer.ts";

const df: RDF.DataFactory = new DataFactory();

export async function constructUiComponents(renderer: ShaclRenderer, shapesGraph: RdfStore, constraintShape: string, dataGraph: RdfStore, focusNode: Term | null | undefined, widgetScoringGraph: RdfStore): Promise<UIComponent[]> {
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
      const rootClass = shapesGraph.getQuads(uiProperty.object, SH("rootClass"), null)[0]?.object;
      const node = shapesGraph.getQuads(uiProperty.object, SH("node"), null)[0]?.object;
      const propertiesLength = shapesGraph.getQuads(uiProperty.object, SH("property"), null).length;
      const defaultChild: UIComponent[] | undefined = node ? await constructUiComponents(renderer, shapesGraph, node.value, dataGraph, null, widgetScoringGraph) :
         (propertiesLength > 0 ? await constructUiComponents(renderer, shapesGraph, uiProperty.object.value, dataGraph, null, widgetScoringGraph) : undefined);
      const pattern = shapesGraph.getQuads(uiProperty.object, SH("pattern"), null)[0]?.object.value;
      const minInclusive = shapesGraph.getQuads(uiProperty.object, SH("minInclusive"), null)[0]?.object.value;
      const maxInclusive = shapesGraph.getQuads(uiProperty.object, SH("maxInclusive"), null)[0]?.object.value;
      const order = shapesGraph.getQuads(uiProperty.object, SH("order"), null)[0]?.object.value;

      let classes: Term[] | undefined = undefined;
      if (clazz) {
         if (clazz.termType === "NamedNode") {
            classes = [clazz];
         } else if (clazz.termType === "BlankNode") {
            classes = extractShaclList(clazz, shapesGraph);
         } else {
            console.warn(`Unsupported sh:class value type ${clazz.termType} for constraint ${uiProperty.object.value}, skipping class extraction for this constraint`);
         }
      }
      let instances: LabeledValue[] | undefined = undefined;
      if (classes) {
         instances = await Promise.all(classes.map(clazz => dataGraph.getQuads(null, RDF_("type"), clazz).map(async (quad) => await toLabeledValue(quad.subject, dataGraph, shapesGraph, renderer.dereferenceForLabelResolution))).flat());
      }
      let classValues: ClassValue[] | undefined = undefined;
      if (classes) {
         classValues = await Promise.all(classes.map(async (clazz) => {
            const classValue: ClassValue = {
               value: await toLabeledValue(clazz, dataGraph, shapesGraph, renderer.dereferenceForLabelResolution),
            };
            // Find NodeShape with sh:targetClass equal to the class, and if found, construct UI components for that NodeShape and add them as children of the class value.
            const nodeShapeQuad = shapesGraph.getQuads(null, SH("targetClass"), clazz)[0];
            if (nodeShapeQuad) {
               classValue.children = await constructUiComponents(renderer, shapesGraph, nodeShapeQuad.subject.value, dataGraph, undefined, widgetScoringGraph);
            }
            return classValue;
         }));
      }

      let subclasses: LabeledValue[] | undefined = undefined;
      if (rootClass) {
         subclasses = [await toLabeledValue(rootClass, dataGraph, shapesGraph, renderer.dereferenceForLabelResolution)];
         await extractSubclasses(rootClass, dataGraph, shapesGraph, subclasses, renderer.dereferenceForLabelResolution);
      }

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
            const nestedComponents = await Promise.all(pathValues.map(async (value) => constructUiComponents(renderer, shapesGraph, node.value, dataGraph, value, widgetScoringGraph)));
            children = [...(children ?? []), ...nestedComponents];
         } else if (classes) {
            const nestedComponents = await Promise.all(pathValues.map(async (value) => {
               const usedClass = dataGraph.getQuads(value, RDF_("type"), null)[0]?.object;
               return await constructUiComponents(renderer, shapesGraph, usedClass.value, dataGraph, value, widgetScoringGraph);
            }));
            children = [...(children ?? []), ...nestedComponents];
         }
         // Also consider child properties defined directly on the PropertyShape.
         if (propertiesLength > 0) {
            const directChildren = await Promise.all(pathValues.map(async (value) => constructUiComponents(renderer, shapesGraph, uiProperty.object.value, dataGraph, value, widgetScoringGraph)));
            children = [...(children ?? []), ...directChildren];
         }

         pathValues.forEach(value => {
            values.push({
               value: value,
               path: path,
            });
         });
      }

      const element: UIComponent = {
         uuid: self.crypto.randomUUID(),
         iri: uiProperty.object,
         focusNode: focusNode ?? undefined,
         paths: paths,
         node: node,
         label: label?.value,
         description: description?.value,
         datatype: datatype?.value,
         values: values,
         children: children,
         defaultChild: defaultChild,
         minCount: minCount ? parseInt(minCount.value) : undefined,
         maxCount: maxCount ? parseInt(maxCount.value) : undefined,
         class: classes?.[0],
         classes: classValues,
         instances: instances,
         rootClass: rootClass,
         subclasses: subclasses,
         pattern: pattern,
         minInclusive: minInclusive,
         maxInclusive: maxInclusive,
         order: order ? parseFloat(order) : undefined,
      }

      // Check if sh:in is present for enumerations, and if so, get all options
      const inQuad = shapesGraph.getQuads(uiProperty.object, SH("in"), null)[0];
      if (inQuad) {
         element.options = await Promise.all(extractShaclList(inQuad.object, shapesGraph).map(async (option) => {
            if (option.termType === "NamedNode" || option.termType === "BlankNode") {
               return await toLabeledValue(option, dataGraph, shapesGraph, renderer.dereferenceForLabelResolution);
            } else {
               return {
                  value: df.fromTerm(option as any),
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
      const defaultWidgetScores = await score(null, dataGraph, uiProperty.object, shapesGraph, widgetScoringGraph, renderer.dereferenceForLabelResolution);
      element.defaultWidget = defaultWidgetScores[0]?.widget.value.value;
      element.defaultWidgets = defaultWidgetScores;

      if (focusNode) {
         const dataGraphWithDefault = RdfStore.createDefault();
         dataGraphWithDefault.import(dataGraph.match());
         const defaultTerm = getDefaultTermForWidget(renderer, element.defaultWidget, element, false);
         for (const path of paths) {
            if (path.type === "predicate") {
               dataGraphWithDefault.addQuad(df.quad(focusNode as Quad_Subject, df.namedNode(path.path), defaultTerm as Quad_Object));
            } else if (path.type === "inverse") {
               dataGraphWithDefault.addQuad(df.quad(defaultTerm as Quad_Subject, df.namedNode(path.path), focusNode as Quad_Object));
            }
         }
         element.defaultWidgets = await score(focusNode, dataGraphWithDefault, uiProperty.object, shapesGraph, widgetScoringGraph, renderer.dereferenceForLabelResolution);
      }

      // Score all values of the component and attach a selectedWidget based on the highest scoring widget for each value.
      element.values = await Promise.all(element.values.map(async (value) => {
         const widgetScores = await score(value.value, dataGraph, uiProperty.object, shapesGraph, widgetScoringGraph, renderer.dereferenceForLabelResolution);
         value.selectedWidget = widgetScores[0]?.widget.value.value;
         value.widgets = widgetScores;
         return value;
      }));

      // Make sure we have at least minCount values, by adding empty values if needed.
      for (let i = values.length; i < (element.minCount ?? 0); i++) {
         const value = getDefaultTermForWidget(renderer, element.defaultWidget, element, true, !!focusNode);
         const path = paths[0];
         renderer.addToDataStore(focusNode ?? undefined, path, value);
         element.values.push({
            value: value,
            path: path,
            selectedWidget: element.defaultWidget,
            widgets: defaultWidgetScores,
         });
      }

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

function extractShaclList(listNode: Term, shapesGraph: RdfStore<any, Quad>): Term[] {
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

export function extractPaths(constraintNode: Term, shapesGraph: RdfStore<any, Quad>, pathObject: Quad_Object): Path[] {
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
      iri: groupNode,
      label: labelQuad?.object.value,
      order: order ? parseFloat(order) : undefined,
   }
}

async function extractSubclasses(rootClass: Term, dataGraph: RdfStore, shapesGraph: RdfStore, subclasses: LabeledValue[], dereferenceForLabelResolution: boolean): Promise<void> {
   const subclassObjects = dataGraph.getQuads(null, RDFS("subClassOf"), rootClass).map(quad => quad.subject);
   for (const obj of subclassObjects) {
      const labeledValue = await toLabeledValue(obj, dataGraph, shapesGraph, dereferenceForLabelResolution);
      subclasses.push(labeledValue);
      await extractSubclasses(obj, dataGraph, shapesGraph, subclasses, dereferenceForLabelResolution);
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
         if (component.class && value.selectedWidget === shui('DetailsEditor')) {
            quads.push(df.quad(value.value as Quad_Subject, RDF_('type'), component.class as Quad_Object));
         }
      }
      if (component.children) {
         for (const child of component.children) {
            quads.push(...uiComponentsToQuads(child));
         }
      }
   }
   return quads;
}

export async function toLabeledValue(term: Term, dataGraph: RdfStore, shapesGraph: RdfStore, dereferenceForLabelResolution: boolean): Promise<LabeledValue> {
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

   if (dereferenceForLabelResolution) {
      // If still no label found, we will try to dereference the term and try to get the label from the dereferenced graph.
      for (const iriToDereference of [term.value, `https://ajuvercr.github.io/lov-mirror/by-iri/${encodeURIComponent(encodeURIComponent(term.value))}.ttl`]) {
         if ((!labelQuad || !descriptionQuad) && term.termType === "NamedNode") {
            try {
               const dereferencedGraph = RdfStore.createDefault();
               const dereferencedOutput = await rdfDereferencer.dereference(iriToDereference, {headers: {"Accept": "application/n-quads,text/turtle;q=0.95,application/ld+json;q=0.9,application/n-triples;q=0.8,*/*;q=0.1"}});
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
      }
   }

   return {
      value: term,
      label: labelQuad ? labelQuad.object.value : term.value,
      description: descriptionQuad ? descriptionQuad.object.value : undefined,
   }
}
