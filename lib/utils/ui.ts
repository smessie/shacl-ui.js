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
   RootOrGroup,
   RootOrOption,
   RootOrSection,
   RootRenderSlot,
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Parse an xsd:integer-style count, returning undefined for missing or non-numeric input. */
function parseCount(value: string | undefined): number | undefined {
   if (value === undefined) return undefined;
   const n = parseInt(value, 10);
   return Number.isNaN(n) ? undefined : n;
}

/** Remove duplicate RDF terms, comparing by term type and value. */
function dedupeTerms(terms: Term[]): Term[] {
   const seen = new Set<string>();
   return terms.filter(term => {
      const key = `${term.termType}:${term.value}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
   });
}

/** Stable sort of UIComponents – first by group order, then by element order.
 *  Elements without an order value come last within their group. */
function sortComponents(elements: UIComponent[]): UIComponent[] {
   return elements.sort((a, b) => {
      if (a.group?.order !== undefined && b.group?.order !== undefined) {
         if (a.group.order !== b.group.order) return a.group.order - b.group.order;
         // Same group → sort by element order.
         if (a.order !== undefined && b.order !== undefined) return a.order - b.order;
         return a.order !== undefined ? -1 : 1;
      }
      if (a.group?.order !== undefined) return -1;
      if (b.group?.order !== undefined) return 1;
      // Neither has a group order.
      if (a.order !== undefined && b.order !== undefined) return a.order - b.order;
      return a.order !== undefined ? -1 : 1;
   });
}

// ---------------------------------------------------------------------------
// Internal builder – processes sh:property on one shape node.
// Used by constructUiComponents (root level) and all recursive/nested calls.
// ---------------------------------------------------------------------------

async function buildUiComponents(
   renderer: ShaclRenderer,
   shapesGraph: RdfStore,
   constraintShape: Term,
   dataGraph: RdfStore,
   focusNode: Term | null | undefined,
   widgetScoringGraph: RdfStore,
): Promise<UIComponent[]> {
   if (!constraintShape) return [];

   const elements: UIComponent[] = [];
   for (const uiProperty of shapesGraph.getQuads(constraintShape, SH("property"), null)) {
      const element = await extractProperty(
         uiProperty.object, renderer, shapesGraph, dataGraph, focusNode, widgetScoringGraph,
      );
      if (element) elements.push(element);
   }

   return sortComponents(elements);
}

// ---------------------------------------------------------------------------
// Public API – handles root-level sh:property AND root-level sh:or.
// ---------------------------------------------------------------------------

/**
 * Constructs UI components for a constraint shape (NodeShape).
 *
 * Returns:
 * - `renderSlots`  – a unified, sorted list of rendering items that mixes
 *                    base `sh:property` components (individual or grouped by
 *                    `sh:group`) together with root-level `sh:or` sections,
 *                    ordered by `sh:order`.  This is the primary input for
 *                    `renderRootSlots` in widgets.ts.
 * - `components`   – flat list of all UIComponents (base + selected or-option),
 *                    used only by `uiComponentsToQuads` for data extraction.
 * - `rootOrGroups` – stable group metadata for `selectRootOrOption` state.
 *
 * Pass the previously returned `rootOrGroups` (with an updated `selectedIndex`)
 * on subsequent calls (e.g. from `selectRootOrOption`) to preserve selections.
 */
export async function constructUiComponents(
   renderer: ShaclRenderer,
   shapesGraph: RdfStore,
   constraintShape: Term,
   dataGraph: RdfStore,
   focusNode: Term | null | undefined,
   widgetScoringGraph: RdfStore,
   existingRootOrGroups?: RootOrGroup[],
): Promise<{ components: UIComponent[]; renderSlots: RootRenderSlot[]; rootOrGroups: RootOrGroup[] }> {
   if (!constraintShape) return {components: [], renderSlots: [], rootOrGroups: []};

   // ── 1. Base properties from sh:property on the root NodeShape ──────────────
   const baseComponents = await buildUiComponents(
      renderer, shapesGraph, constraintShape, dataGraph, focusNode, widgetScoringGraph,
   );

   // ── 2. Root-level sh:or ────────────────────────────────────────────────────
   const rootOrGroups: RootOrGroup[] = [];
   const rootOrSections: RootOrSection[] = [];

   for (const orQuad of shapesGraph.getQuads(constraintShape, SH("or"), null)) {
      const orListHead = orQuad.object;
      const orList = extractShaclList(orListHead, shapesGraph);

      const options: RootOrOption[] = orList.map(item => ({
         node: item,
         label: shapesGraph.getQuads(item, SH("name"), null)[0]?.object.value,
         description: shapesGraph.getQuads(item, SH("description"), null)[0]?.object.value,
      }));

      if (options.length === 0) continue;

      const existing = existingRootOrGroups?.find(g => g.orListNode.value === orListHead.value);
      const selectedIndex = Math.min(existing?.selectedIndex ?? 0, options.length - 1);

      // Determine the effective sh:order for this or-group by reading sh:order
      // directly from each option node shape (same level as sh:name / sh:description).
      let order: number | undefined = undefined;
      for (const item of orList) {
         const orderRaw = shapesGraph.getQuads(item, SH("order"), null)[0]?.object.value;
         if (orderRaw !== undefined) {
            const v = parseFloat(orderRaw);
            if (!isNaN(v) && (order === undefined || v < order)) order = v;
         }
      }

      const group: RootOrGroup = {orListNode: orListHead, options, selectedIndex, order};
      rootOrGroups.push(group);

      const selectedNode = options[selectedIndex]?.node;
      let sectionComponents: UIComponent[] = [];
      if (selectedNode) {
         sectionComponents = await buildUiComponents(
            renderer, shapesGraph, selectedNode, dataGraph, focusNode, widgetScoringGraph,
         );
      }
      rootOrSections.push({group, components: sectionComponents});
   }

   // ── 3. Build unified sorted renderSlots ────────────────────────────────────
   //
   // Strategy:
   //   • Ungrouped base components → individual 'component' slots (sort key = component.order).
   //   • Grouped base components  → one 'group' slot per sh:group IRI
   //                                 (sort key = group.order, docIdx = first occurrence).
   //   • Or-sections              → 'orSection' slots (sort key = group.order).
   //
   // A monotonically increasing docIdx is assigned to each slot as it is first
   // encountered, so that stable sort preserves the original document order among
   // slots with equal sh:order values.

   interface SlotMeta {
      effectiveOrder: number;
      docIdx: number;
      build: () => RootRenderSlot;
   }

   const slotMetas: SlotMeta[] = [];
   let docIdx = 0;

   // Group buckets for clustered sh:group rendering.
   const groupBuckets = new Map<string, { components: UIComponent[]; docIdx: number; effectiveOrder: number }>();

   // baseComponents is already sorted (by sortComponents), so we iterate in order.
   for (const comp of baseComponents) {
      if (comp.group) {
         const key = comp.group.iri.value;
         if (!groupBuckets.has(key)) {
            groupBuckets.set(key, {
               components: [],
               docIdx: docIdx++,
               effectiveOrder: comp.group.order ?? Infinity,
            });
         }
         groupBuckets.get(key)!.components.push(comp);
      } else {
         const d = docIdx++;
         slotMetas.push({
            effectiveOrder: comp.order ?? Infinity,
            docIdx: d,
            build: () => ({kind: 'component', component: comp}),
         });
      }
   }
   for (const bucket of groupBuckets.values()) {
      const comps = bucket.components;
      slotMetas.push({
         effectiveOrder: bucket.effectiveOrder,
         docIdx: bucket.docIdx,
         build: () => ({kind: 'group', components: comps}),
      });
   }

   rootOrSections.forEach((section, groupIndex) => {
      slotMetas.push({
         effectiveOrder: section.group.order ?? Infinity,
         docIdx: docIdx++,
         build: () => ({kind: 'orSection', section, groupIndex}),
      });
   });

   slotMetas.sort((a, b) =>
      a.effectiveOrder !== b.effectiveOrder
         ? a.effectiveOrder - b.effectiveOrder
         : a.docIdx - b.docIdx,
   );

   const renderSlots: RootRenderSlot[] = slotMetas.map(m => m.build());

   // ── 4. Flat component list for data extraction ─────────────────────────────
   const allComponents = sortComponents([
      ...baseComponents,
      ...rootOrSections.flatMap(s => s.components),
   ]);

   return {components: allComponents, renderSlots, rootOrGroups};
}

async function extractProperty(property: Term, renderer: ShaclRenderer, shapesGraph: RdfStore, dataGraph: RdfStore, focusNode: Term | null | undefined, widgetScoringGraph: RdfStore): Promise<UIComponent | undefined> {
   const pathQuads = shapesGraph.getQuads(property, SH("path"), null);
   if (pathQuads.length !== 1) {
      console.warn(`Expected exactly one sh:path for constraint ${property.value}, found ${pathQuads.length}, skipping path extraction for this constraint`);
      return;
   }
   const paths = extractPaths(property, shapesGraph, pathQuads[0].object);

   if (!paths || paths.length === 0) {
      console.warn(`UI property ${property.value} does not have a valid path, skipping`);
      return;
   }

   const label = shapesGraph.getQuads(property, SH("name"), null)[0]?.object;
   const description = shapesGraph.getQuads(property, SH("description"), null)[0]?.object;
   const datatype = shapesGraph.getQuads(property, SH("datatype"), null)[0]?.object;
   const minCount = shapesGraph.getQuads(property, SH("minCount"), null)[0]?.object;
   const maxCount = shapesGraph.getQuads(property, SH("maxCount"), null)[0]?.object;
   const clazz = shapesGraph.getQuads(property, SH("class"), null)[0]?.object;
   const rootClass = shapesGraph.getQuads(property, SH("rootClass"), null)[0]?.object;
   const node = shapesGraph.getQuads(property, SH("node"), null)[0]?.object;
   const propertiesLength = shapesGraph.getQuads(property, SH("property"), null).length;
   const defaultChild: UIComponent[] | undefined = node
      ? await buildUiComponents(renderer, shapesGraph, node, dataGraph, null, widgetScoringGraph)
      : (propertiesLength > 0
         ? await buildUiComponents(renderer, shapesGraph, property, dataGraph, null, widgetScoringGraph)
         : undefined);
   const pattern = shapesGraph.getQuads(property, SH("pattern"), null)[0]?.object.value;
   const minInclusive = shapesGraph.getQuads(property, SH("minInclusive"), null)[0]?.object.value;
   const maxInclusive = shapesGraph.getQuads(property, SH("maxInclusive"), null)[0]?.object.value;
   const order = shapesGraph.getQuads(property, SH("order"), null)[0]?.object.value;
   const nodeKind = shapesGraph.getQuads(property, SH("nodeKind"), null)[0]?.object;
   const or = shapesGraph.getQuads(property, SH("or"), null)[0]?.object;
   const hasValue = shapesGraph.getQuads(property, SH("hasValue"), null)[0]?.object;

   let classes: Term[] | undefined = undefined;
   if (clazz) {
      if (clazz.termType === "NamedNode") {
         classes = [clazz];
         await extractSubclasses(clazz, dataGraph, shapesGraph, classes);
      } else if (clazz.termType === "BlankNode") {
         classes = extractShaclList(clazz, shapesGraph);
      } else {
         console.warn(`Unsupported sh:class value type ${clazz.termType} for constraint ${property.value}, skipping class extraction for this constraint`);
      }
   }
   let instances: LabeledValue[] | undefined = undefined;
   if (classes) {
      // A subject can be typed by several classes/subclasses in either graph; dedupe so each
      // instance appears once in the dropdown.
      const instanceSubjects = dedupeTerms(classes.flatMap(clazz => [
         ...dataGraph.getQuads(null, RDF_("type"), clazz),
         ...shapesGraph.getQuads(null, RDF_("type"), clazz),
      ].map(quad => quad.subject)));
      instances = await Promise.all(instanceSubjects.map(subject => toLabeledValue(subject, dataGraph, shapesGraph, renderer.dereferenceForLabelResolution)));
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
            classValue.children = await buildUiComponents(renderer, shapesGraph, nodeShapeQuad.subject, dataGraph, undefined, widgetScoringGraph);
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
         console.warn(`Unsupported path type ${path.type} for constraint ${property.value}, skipping value extraction for this path`);
         continue;
      }

      const pathValues = path.type === "predicate"
         ? (focusNode ? dataGraph.getQuads(focusNode, df.namedNode(path.path), null).map(quad => quad.object) : [])
         : (focusNode ? dataGraph.getQuads(null, df.namedNode(path.path), focusNode).map(quad => quad.subject) : []);

      // Build the nested children for each value. A PropertyShape may combine sh:node
      // (or sh:class) with inline sh:property; in that case both sets of components apply
      // to the SAME value, so they are merged into one child entry per value to keep the
      // children array aligned 1:1 with values (previously they were appended as separate
      // entries, doubling the children and misaligning child[index] lookups).
      if (node || classes || propertiesLength > 0) {
         const nestedPerValue = await Promise.all(pathValues.map(async (value) => {
            const parts: UIComponent[] = [];
            if (node) {
               parts.push(...await buildUiComponents(renderer, shapesGraph, node, dataGraph, value, widgetScoringGraph));
            } else if (classes) {
               const usedClass = dataGraph.getQuads(value, RDF_("type"), null)[0]?.object;
               parts.push(...await buildUiComponents(renderer, shapesGraph, usedClass, dataGraph, value, widgetScoringGraph));
            }
            if (propertiesLength > 0) {
               parts.push(...await buildUiComponents(renderer, shapesGraph, property, dataGraph, value, widgetScoringGraph));
            }
            return parts;
         }));
         children = [...(children ?? []), ...nestedPerValue];
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
      iri: property,
      focusNode: focusNode ?? undefined,
      paths: paths,
      node: node,
      label: label?.value,
      description: description?.value,
      datatype: datatype?.value,
      values: values,
      children: children,
      defaultChild: defaultChild,
      minCount: parseCount(minCount?.value),
      maxCount: parseCount(maxCount?.value),
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
            const defaultChild = await buildUiComponents(renderer, shapesGraph, node, dataGraph, null, widgetScoringGraph);

            let values: UIComponentValue[] = [];
            let children: UIComponent[][] | undefined = undefined;
            for (const path of paths) {
               if (path.type !== "predicate" && path.type !== "inverse") {
                  console.warn(`Unsupported path type ${path.type} for constraint ${property.value}, skipping value extraction for this path`);
                  continue;
               }

               const pathValues = path.type === "predicate"
                  ? (focusNode ? dataGraph.getQuads(focusNode, df.namedNode(path.path), null).map(quad => quad.object) : [])
                  : (focusNode ? dataGraph.getQuads(null, df.namedNode(path.path), focusNode).map(quad => quad.subject) : []);

               // sh:node is present, so we need to recursively construct UI components for the nested shape
               const nestedComponents = await Promise.all(pathValues.map(async (value) => buildUiComponents(renderer, shapesGraph, node, dataGraph, value, widgetScoringGraph)));
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
               classValue.children = await buildUiComponents(renderer, shapesGraph, nodeShapeQuad.subject, dataGraph, undefined, widgetScoringGraph);
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
   const inQuad = shapesGraph.getQuads(property, SH("in"), null)[0];
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
   const groupQuad = shapesGraph.getQuads(property, SH("group"), null)[0];
   if (groupQuad) {
      element.group = extractGroup(groupQuad, shapesGraph);
   }

   // Check if sh:singleLine is present
   const singleLineQuad = shapesGraph.getQuads(property, SH("singleLine"), null)[0];
   if (singleLineQuad) {
      element.singleLine = singleLineQuad.object.value === "true" || singleLineQuad.object.value === "1";
   }

   // Configure default widget based on the shape only.
   const defaultWidgetScores = await score(null, dataGraph, property, shapesGraph, widgetScoringGraph, renderer.dereferenceForLabelResolution);
   element.defaultWidget = defaultWidgetScores[0]?.widget.value.value;
   element.defaultWidgets = defaultWidgetScores;

   if (focusNode) {
      // Score the default widget as if the focus node already held a default value. Rather than
      // cloning the whole data graph per property (O(properties × N)), temporarily add the default
      // quad(s) to the shared store, score, then remove exactly the quads we introduced (addQuad
      // returns false for quads that already existed, so pre-existing data is never removed).
      const defaultTerm = getDefaultTermForWidget(renderer, element.defaultWidget, element, false);
      const addedQuads: Quad[] = [];
      for (const path of paths) {
         const quad = path.type === "predicate"
            ? df.quad(focusNode as Quad_Subject, df.namedNode(path.path), defaultTerm as Quad_Object)
            : path.type === "inverse"
               ? df.quad(defaultTerm as Quad_Subject, df.namedNode(path.path), focusNode as Quad_Object)
               : undefined;
         if (quad && dataGraph.addQuad(quad)) {
            addedQuads.push(quad);
         }
      }
      try {
         element.defaultWidgets = await score(focusNode, dataGraph, property, shapesGraph, widgetScoringGraph, renderer.dereferenceForLabelResolution);
         element.defaultWidget = element.defaultWidgets[0]?.widget.value.value;
      } finally {
         for (const quad of addedQuads) dataGraph.removeQuad(quad);
      }
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
      const widgetScores = await score(value.value, dataGraph, property, shapesGraph, widgetScoringGraph, renderer.dereferenceForLabelResolution);
      value.selectedWidget = widgetScores[0]?.widget.value.value;
      value.widgets = widgetScores;
      return value;
   }));

   return element;
}

export function extractShaclList(listNode: Term, shapesGraph: RdfStore<any, Quad>): Term[] {
   const options: Term[] = [];
   const visited = new Set<string>();
   let currentNode = listNode;
   while (currentNode.value !== rdf("nil")) {
      if (visited.has(currentNode.value)) break; // guard against malformed/cyclic lists
      visited.add(currentNode.value);
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
   const visited = new Set<string>();
   let currentNode = alternativePathNode;
   while (currentNode.value !== rdf("nil")) {
      if (visited.has(currentNode.value)) break; // guard against malformed/cyclic lists
      visited.add(currentNode.value);
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

export async function extractSubclasses(rootClass: Term, dataGraph: RdfStore, shapesGraph: RdfStore, subclasses: Term[], visited: Set<string> = new Set<string>([rootClass.value])): Promise<void> {
   const subclassObjects = [... dataGraph.getQuads(null, RDFS("subClassOf"), rootClass).map(quad => quad.subject), ...shapesGraph.getQuads(null, RDFS("subClassOf"), rootClass).map(quad => quad.subject)];
   for (const subclass of subclassObjects) {
      if (visited.has(subclass.value)) continue; // guard against cyclic/diamond subclass hierarchies
      visited.add(subclass.value);
      subclasses.push(subclass);
      await extractSubclasses(subclass, dataGraph, shapesGraph, subclasses, visited);
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
