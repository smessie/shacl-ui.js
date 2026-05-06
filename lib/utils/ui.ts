import {RdfStore} from "rdf-stores";
import {DataFactory} from "rdf-data-factory";
import type {Quad, Quad_Object, Quad_Subject} from "rdf-js";
import * as RDF from 'rdf-js';
import type {Term} from "@rdfjs/types";
import type {
   ClassValue,
   LabeledValue,
   OrClass,
   OrDatatype,
   OrNode,
   Path,
   UIComponent,
   UIComponentValue,
   UIGroup
} from "./types.ts";
import {DCTERMS, rdf, RDF as RDF_, RDFS, SCHEMA, SH, shui, SKOS} from "./namespaces.ts";
import {score} from "./score.ts";
import {getDefaultTermForWidget} from "./widgets.ts";
import {rdfDereferencer} from "rdf-dereference";
import {ShaclRenderer} from "../shacl-renderer.ts";

const df: RDF.DataFactory = new DataFactory();

export async function constructUiComponents(renderer: ShaclRenderer, shapesGraph: RdfStore, constraintShape: Term, dataGraph: RdfStore, focusNode: Term | null | undefined, widgetScoringGraph: RdfStore): Promise<UIComponent[]> {
   if (!constraintShape) {
      return [];
   }
   const rootNode: Term = constraintShape;
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
      const defaultChild: UIComponent[] | undefined = node ? await constructUiComponents(renderer, shapesGraph, node, dataGraph, null, widgetScoringGraph) :
         (propertiesLength > 0 ? await constructUiComponents(renderer, shapesGraph, uiProperty.object, dataGraph, null, widgetScoringGraph) : undefined);
      const pattern = shapesGraph.getQuads(uiProperty.object, SH("pattern"), null)[0]?.object.value;
      const minInclusive = shapesGraph.getQuads(uiProperty.object, SH("minInclusive"), null)[0]?.object.value;
      const maxInclusive = shapesGraph.getQuads(uiProperty.object, SH("maxInclusive"), null)[0]?.object.value;
      const order = shapesGraph.getQuads(uiProperty.object, SH("order"), null)[0]?.object.value;
      const nodeKind = shapesGraph.getQuads(uiProperty.object, SH("nodeKind"), null)[0]?.object;
      const or = shapesGraph.getQuads(uiProperty.object, SH("or"), null)[0]?.object;
      const hasValue = shapesGraph.getQuads(uiProperty.object, SH("hasValue"), null)[0]?.object;

      let classes: Term[] | undefined = undefined;
      if (clazz) {
         if (clazz.termType === "NamedNode") {
            classes = [clazz];
            await extractSubclasses(clazz, dataGraph, shapesGraph, classes);
         } else if (clazz.termType === "BlankNode") {
            classes = extractShaclList(clazz, shapesGraph);
         } else {
            console.warn(`Unsupported sh:class value type ${clazz.termType} for constraint ${uiProperty.object.value}, skipping class extraction for this constraint`);
         }
      }
      let instances: LabeledValue[] | undefined = undefined;
      if (classes) {
         instances = await Promise.all(classes.map(clazz => [...dataGraph.getQuads(null, RDF_("type"), clazz), ...shapesGraph.getQuads(null, RDF_("type"), clazz)].map(async (quad) => await toLabeledValue(quad.subject, dataGraph, shapesGraph, renderer.dereferenceForLabelResolution))).flat());
      }
      let classValues: ClassValue[] | undefined = undefined;
      if (classes) {
         classValues = await Promise.all(classes.map(async (clazz) => {
            const classValue: ClassValue = {
               iri: clazz,
               value: await toLabeledValue(clazz, dataGraph, shapesGraph, renderer.dereferenceForLabelResolution),
            };
            // Find NodeShape with sh:targetClass equal to the class, and if found, construct UI components for that NodeShape and add them as children of the class value.
            const nodeShapeQuad = shapesGraph.getQuads(null, SH("targetClass"), clazz)[0];
            if (nodeShapeQuad) {
               classValue.children = await constructUiComponents(renderer, shapesGraph, nodeShapeQuad.subject, dataGraph, undefined, widgetScoringGraph);
            }
            return classValue;
         }));
      }

      let labeledSubclasses: LabeledValue[] | undefined = undefined;
      let subclasses: Term[] | undefined = undefined;
      if (rootClass) {
         subclasses = [rootClass];
         await extractSubclasses(rootClass, dataGraph, shapesGraph, subclasses);
         labeledSubclasses = await Promise.all(subclasses.map(async (subclass) => await toLabeledValue(subclass, dataGraph, shapesGraph, renderer.dereferenceForLabelResolution)));
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
            const nestedComponents = await Promise.all(pathValues.map(async (value) => constructUiComponents(renderer, shapesGraph, node, dataGraph, value, widgetScoringGraph)));
            children = [...(children ?? []), ...nestedComponents];
         } else if (classes) {
            const nestedComponents = await Promise.all(pathValues.map(async (value) => {
               const usedClass = dataGraph.getQuads(value, RDF_("type"), null)[0]?.object;
               return await constructUiComponents(renderer, shapesGraph, usedClass, dataGraph, value, widgetScoringGraph);
            }));
            children = [...(children ?? []), ...nestedComponents];
         }
         // Also consider child properties defined directly on the PropertyShape.
         if (propertiesLength > 0) {
            const directChildren = await Promise.all(pathValues.map(async (value) => constructUiComponents(renderer, shapesGraph, uiProperty.object, dataGraph, value, widgetScoringGraph)));
            children = [...(children ?? []), ...directChildren];
         }

         pathValues.forEach(value => {
            values.push({
               value: value,
               path: path,
            });
         });
      }

      // Ensure sh:hasValue term is always present as the first value.
      if (hasValue) {
         const idx = values.findIndex(v => v.value.equals(hasValue));
         if (idx < 0) {
            // Not in data graph yet – prepend it and add it to the store.
            const path = paths[0];
            if (focusNode) {
               renderer.addToDataStore(focusNode, path, hasValue);
            }
            values.unshift({ value: hasValue, path });
         } else if (idx > 0) {
            // Already present but not first – move it to the front.
            const [entry] = values.splice(idx, 1);
            values.unshift(entry);
         }
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
         classes: classValues,
         instances: instances,
         rootClass: rootClass,
         subclasses: labeledSubclasses,
         pattern: pattern,
         minInclusive: minInclusive,
         maxInclusive: maxInclusive,
         order: order ? parseFloat(order) : undefined,
         nodeKind: nodeKind,
         hasValue: hasValue,
      }

      // Handle sh:or if present; only union of the same constraint is supported.
      if (or) {
         const orList = extractShaclList(or, shapesGraph);
         if (orList.every(orListItem => shapesGraph.getQuads(orListItem, SH("node"), null).length === 1)) {
            // Handle sh:or of sh:node constraints.
            element.orNode = await Promise.all(orList.map(async orListItem => {
               const node = shapesGraph.getQuads(orListItem, SH("node"), null)[0]?.object;
               const defaultChild = await constructUiComponents(renderer, shapesGraph, node, dataGraph, null, widgetScoringGraph);

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

                  // sh:node is present, so we need to recursively construct UI components for the nested shape
                  const nestedComponents = await Promise.all(pathValues.map(async (value) => constructUiComponents(renderer, shapesGraph, node, dataGraph, value, widgetScoringGraph)));
                  children = [...(children ?? []), ...nestedComponents];

                  pathValues.forEach(value => {
                     values.push({
                        value: value,
                        path: path,
                     });
                  });
               }

               return {
                  node: node,
                  values: values,
                  children: children,
                  defaultChild: defaultChild,
               } as OrNode;
            }));
         } else if (orList.every(orListItem => shapesGraph.getQuads(orListItem, SH("datatype"), null).length === 1)) {
            // Handle sh:or of sh:datatype constraints.
            element.orDatatype = orList.map(orListItem => {
               const datatype = shapesGraph.getQuads(orListItem, SH("datatype"), null)[0]?.object;
               return {
                  datatype: datatype?.value,
               } as OrDatatype;
            });
         } else if (orList.every(orListItem => shapesGraph.getQuads(orListItem, SH("class"), null).length === 1)) {
            // Handle sh:or of sh:class constraints.
            element.orClass = await Promise.all(orList.map(async orListItem => {
               const clazz = shapesGraph.getQuads(orListItem, SH("class"), null)[0]?.object;
               const classTerms: Term[] = [clazz];
               await extractSubclasses(clazz, dataGraph, shapesGraph, classTerms);
               const instances = await Promise.all(
                  classTerms.flatMap(c => [
                     ...dataGraph.getQuads(null, RDF_("type"), c),
                     ...shapesGraph.getQuads(null, RDF_("type"), c)
                  ].map(async quad => toLabeledValue(quad.subject, dataGraph, shapesGraph, renderer.dereferenceForLabelResolution)))
               );
               const classValue: ClassValue = {
                  iri: clazz,
                  value: await toLabeledValue(clazz, dataGraph, shapesGraph, renderer.dereferenceForLabelResolution),
               };
               const nodeShapeQuad = shapesGraph.getQuads(null, SH("targetClass"), clazz)[0];
               if (nodeShapeQuad) {
                  classValue.children = await constructUiComponents(renderer, shapesGraph, nodeShapeQuad.subject, dataGraph, undefined, widgetScoringGraph);
               }
               return { class: clazz, classValue, instances } as OrClass;
            }));
         } else {
            console.warn(`sh:or is only supported for unions of the same constraint. Allowed constraints are sh:node, sh:datatype, or sh:class.`)
         }

         // Auto-detect which or-option matches existing data, then apply it so the
         // rest of the rendering code sees the correct node / children / datatype / classes.
         let selectedOrIndex = 0;
         if (element.orDatatype && element.values.length > 0) {
            const valueDatatype = element.values[0].value.termType === 'Literal'
               ? (element.values[0].value as any).datatype?.value
               : undefined;
            if (valueDatatype) {
               const matchIndex = element.orDatatype.findIndex(opt => opt.datatype === valueDatatype);
               if (matchIndex >= 0) selectedOrIndex = matchIndex;
            }
         } else if (element.orClass && element.values.length > 0) {
            const valueType = dataGraph.getQuads(element.values[0].value, RDF_("type"), null)[0]?.object.value;
            if (valueType) {
               const matchIndex = element.orClass.findIndex(opt => opt.class.value === valueType);
               if (matchIndex >= 0) selectedOrIndex = matchIndex;
            }
         }
         applyOrOption(element, selectedOrIndex);

         // Set per-value selectedOrIndex, detecting each value's or-option individually.
         for (const v of element.values) {
            if (element.orDatatype) {
               const dt = v.value.termType === 'Literal' ? (v.value as any).datatype?.value : undefined;
               const idx = dt ? element.orDatatype.findIndex(opt => opt.datatype === dt) : -1;
               v.selectedOrIndex = idx >= 0 ? idx : selectedOrIndex;
            } else if (element.orClass) {
               const vType = dataGraph.getQuads(v.value, RDF_("type"), null)[0]?.object.value;
               const idx = vType ? element.orClass.findIndex(opt => opt.class.value === vType) : -1;
               v.selectedOrIndex = idx >= 0 ? idx : selectedOrIndex;
            } else {
               v.selectedOrIndex = selectedOrIndex;
            }
         }
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
         element.defaultWidget = element.defaultWidgets[0]?.widget.value.value;
      }

      // Make sure we have at least minCount values, by adding empty values if needed.
      for (let i = values.length; i < (element.minCount ?? 0); i++) {
         const value = getDefaultTermForWidget(renderer, element.defaultWidget, element, true, !!focusNode);
         const path = paths[0];
         renderer.addToDataStore(focusNode ?? undefined, path, value);
         element.values.push({
            value: value,
            path: path,
            class: element.classes?.[0]?.iri,
            selectedWidget: element.defaultWidget,
            widgets: defaultWidgetScores,
            selectedOrIndex: element.selectedOrIndex,
         });
      }

      // Score all values of the component and attach a selectedWidget based on the highest scoring widget for each value.
      element.values = await Promise.all(element.values.map(async (value) => {
         const widgetScores = await score(value.value, dataGraph, uiProperty.object, shapesGraph, widgetScoringGraph, renderer.dereferenceForLabelResolution);
         value.selectedWidget = widgetScores[0]?.widget.value.value;
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

async function extractSubclasses(rootClass: Term, dataGraph: RdfStore, shapesGraph: RdfStore, subclasses: Term[]): Promise<void> {
   const subclassObjects = [... dataGraph.getQuads(null, RDFS("subClassOf"), rootClass).map(quad => quad.subject), ...shapesGraph.getQuads(null, RDFS("subClassOf"), rootClass).map(quad => quad.subject)];
   for (const subclass of subclassObjects) {
      subclasses.push(subclass);
      await extractSubclasses(subclass, dataGraph, shapesGraph, subclasses);
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
         if (value.class && value.selectedWidget === shui('DetailsEditor')) {
            quads.push(df.quad(value.value as Quad_Subject, RDF_('type'), value.class as Quad_Object));
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
      || shapesGraph.getQuads(term, SCHEMA("name"), null)[0]
      || shapesGraph.getQuads(term, SH("name"), null)[0];

   let descriptionQuad = dataGraph.getQuads(term, RDFS("comment"), null)[0]
      || dataGraph.getQuads(term, DCTERMS("description"), null)[0]
      // Or try to retrieve description from shapes graph if not found in data graph.
      || shapesGraph.getQuads(term, RDFS("comment"), null)[0]
      || shapesGraph.getQuads(term, DCTERMS("description"), null)[0]
      || shapesGraph.getQuads(term, SH("description"), null)[0];

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

/**
 * Applies an or-option (from orNode / orDatatype / orClass) to the UIComponent,
 * populating the relevant fields so the rest of the rendering code can treat the
 * selected option transparently.
 */
function applyOrOption(element: UIComponent, index: number): void {
   element.selectedOrIndex = index;
   if (element.orNode && element.orNode[index]) {
      const option = element.orNode[index];
      element.node = option.node;
      element.defaultChild = option.defaultChild;
      element.children = option.children;
   } else if (element.orDatatype && element.orDatatype[index]) {
      element.datatype = element.orDatatype[index].datatype;
   } else if (element.orClass && element.orClass[index]) {
      const option = element.orClass[index];
      element.classes = [option.classValue];
      element.instances = option.instances;
      // Ensure children is initialized so getDefaultTermForWidget can populate it.
      if (element.children === undefined) {
         element.children = [];
      }
   }
}
