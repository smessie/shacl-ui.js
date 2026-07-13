import {RdfStore} from "rdf-stores";
import {DataFactory} from "rdf-data-factory";
import type {Quad, Quad_Object, Quad_Subject, Term} from "@rdfjs/types";
import * as RDF from '@rdfjs/types';
import type {
   ClassValue,
   LabeledValue,
   OrClass,
   OrDatatype,
   OrNode,
   RootOrGroup,
   RootOrOption,
   RootOrSection,
   RootRenderSlot,
   UIComponent,
   UIComponentValue,
   UIGroup,
   WidgetScore
} from "../types.ts";
import {DCTERMS, isViewerIri, RDF as RDF_, RDFS, SCHEMA, SH, shui, SKOS} from "./namespaces.ts";
import {score} from "./score.ts";
import {extractShaclList, extractSubclasses} from "./rdf-list.ts";
import {extractPaths} from "./paths.ts";
import {toLabeledValue, toPropertyLabel, selectByLanguage, extractLanguageIn} from "./labels.ts";
import {getDefaultTermForWidget} from "../presentation/widgets.ts";
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
         if (a.order === undefined && b.order === undefined) return 0;
         return a.order !== undefined ? -1 : 1;
      }
      if (a.group?.order !== undefined) return -1;
      if (b.group?.order !== undefined) return 1;
      // Neither has a group order.
      if (a.order !== undefined && b.order !== undefined) return a.order - b.order;
      if (a.order === undefined && b.order === undefined) return 0;
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

      const rootLabelConfig = renderer.labelConfig;
      const options: RootOrOption[] = orList.map(item => ({
         node: item,
         label: selectByLanguage(shapesGraph.getQuads(item, SH("name"), null), {preferredLanguages: rootLabelConfig.preferredLanguages})?.value,
         description: selectByLanguage(shapesGraph.getQuads(item, SH("description"), null), {preferredLanguages: rootLabelConfig.preferredLanguages})?.value,
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

   const singlePredicate = paths.length === 1 && (paths[0].type === "predicate" || paths[0].type === "inverse")
      ? paths[0].path
      : undefined;
   const labelConfig = renderer.labelConfig;
   const resolvedLabel = await toPropertyLabel(property, singlePredicate, dataGraph, shapesGraph, labelConfig);
   const label = resolvedLabel.length > 0 ? resolvedLabel : undefined;
   const description = selectByLanguage(
      shapesGraph.getQuads(property, SH("description"), null),
      {languageIn: extractLanguageIn(property, shapesGraph), preferredLanguages: labelConfig.preferredLanguages},
   )?.value;
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
         extractSubclasses(clazz, dataGraph, shapesGraph, classes);
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
      instances = await Promise.all(instanceSubjects.map(subject => toLabeledValue(subject, dataGraph, shapesGraph, renderer.labelConfig)));
   }
   let classValues: ClassValue[] | undefined = undefined;
   if (classes) {
      classValues = await Promise.all(classes.map(async (clazz) => {
         const classValue: ClassValue = {
            iri: clazz,
            value: await toLabeledValue(clazz, dataGraph, shapesGraph, renderer.labelConfig),
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
      extractSubclasses(rootClass, dataGraph, shapesGraph, subclasses);
      labeledSubclasses = await Promise.all(subclasses.map(async (subclass) => await toLabeledValue(subclass, dataGraph, shapesGraph, renderer.labelConfig)));
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
               if (usedClass) {
                  // Resolve the node shape targeting the class (sh:targetClass); fall back to the
                  // class term itself to keep supporting implicit class shapes (shape == class).
                  const usedShape = shapesGraph.getQuads(null, SH("targetClass"), usedClass)[0]?.subject ?? usedClass;
                  parts.push(...await buildUiComponents(renderer, shapesGraph, usedShape, dataGraph, value, widgetScoringGraph));
               }
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
      label: label,
      description: description,
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
            extractSubclasses(clazz, dataGraph, shapesGraph, classTerms);
            // Dedupe subjects typed in both graphs or by several (sub)classes, mirroring the
            // main sh:class path above.
            const instanceSubjects = dedupeTerms(classTerms.flatMap(c => [
               ...dataGraph.getQuads(null, RDF_("type"), c),
               ...shapesGraph.getQuads(null, RDF_("type"), c)
            ].map(quad => quad.subject)));
            const instances = await Promise.all(
               instanceSubjects.map(subject => toLabeledValue(subject, dataGraph, shapesGraph, renderer.labelConfig))
            );
            const classValue: ClassValue = {
               iri: clazz,
               value: await toLabeledValue(clazz, dataGraph, shapesGraph, renderer.labelConfig),
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
            return await toLabeledValue(option, dataGraph, shapesGraph, renderer.labelConfig);
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

   // A single scoring graph mixes editors and viewers (viewer IRIs end in "Viewer"). Keep only
   // the kind that matches the current mode on the shared defaultWidget/selectedWidget fields, so
   // edit mode dispatches to editors and view mode to viewers through the same properties.
   const viewMode = renderer.mode === 'view';
   const forMode = (scores: WidgetScore[]) => scores.filter(s => isViewerIri(s.widget.value.value) === viewMode);
   // The top editor is always tracked separately for construction-time default-value creation
   // (getDefaultTermForWidget), which is inherently an editing concern.
   const topEditor = (scores: WidgetScore[]) => scores.find(s => !isViewerIri(s.widget.value.value))?.widget.value.value;

   // Configure the default widget based on the shape only.
   const defaultScores = await score(null, dataGraph, property, shapesGraph, widgetScoringGraph, renderer.labelConfig);
   let editorDefaultWidget = topEditor(defaultScores);
   element.defaultWidgets = forMode(defaultScores);
   element.defaultWidget = element.defaultWidgets[0]?.widget.value.value;

   if (focusNode) {
      // Score the default widget as if the focus node already held a default value. Rather than
      // cloning the whole data graph per property (O(properties × N)), temporarily add the default
      // quad(s) to the shared store, score, then remove exactly the quads we introduced (addQuad
      // returns false for quads that already existed, so pre-existing data is never removed).
      const defaultTerm = getDefaultTermForWidget(renderer, editorDefaultWidget, element, false);
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
      // A non-literal default value (a fresh nested node) is only added as an object above, but
      // validationFunction requires non-literal value nodes to appear as a subject in the data
      // graph. Seed a temporary type triple so the prospective value is scored by its node kind
      // (e.g. shui:isIRIOrBlankNode -> DetailsEditor), mirroring how a real nested value becomes a
      // subject once its default children are materialised. No widget dataGraphShape inspects the
      // value's class, so the concrete type is irrelevant to scoring; use the declared class when
      // known for faithfulness, otherwise rdfs:Resource.
      if (defaultTerm.termType !== "Literal" && dataGraph.getQuads(defaultTerm, null, null).length === 0) {
         const typeTerm = clazz && clazz.termType === "NamedNode" ? clazz : RDFS("Resource");
         const typeQuad = df.quad(defaultTerm as Quad_Subject, RDF_("type"), typeTerm as Quad_Object);
         if (dataGraph.addQuad(typeQuad)) {
            addedQuads.push(typeQuad);
         }
      }
      try {
         // Score the just-added default value node, not the parent focus node. The scoring
         // function's first argument is the value being scored (its node kind is validated
         // against each score's shui:dataGraphShape); passing focusNode here would score the
         // parent subject instead, so an IRI subject would spuriously match IRI/blank-node
         // widgets (e.g. DetailsEditor at score 0) regardless of the property's value kind.
         const scores = await score(defaultTerm, dataGraph, property, shapesGraph, widgetScoringGraph, renderer.labelConfig);
         editorDefaultWidget = topEditor(scores);
         element.defaultWidgets = forMode(scores);
         element.defaultWidget = element.defaultWidgets[0]?.widget.value.value;
      } finally {
         for (const quad of addedQuads) dataGraph.removeQuad(quad);
      }
   }

   // Make sure we have at least minCount values, by adding empty values if needed. New values are
   // always seeded with the editor's default term, even in view mode.
   const dataValueCount = element.values.length;
   for (let i = values.length; i < (element.minCount ?? 0); i++) {
      const value = getDefaultTermForWidget(renderer, editorDefaultWidget, element, true, !!focusNode);
      const path = paths[0];
      renderer.addToDataStore(focusNode ?? undefined, path, value);
      element.values.push({
         value: value,
         path: path,
         class: element.classes?.[0]?.iri,
         selectedWidget: element.defaultWidget,
         widgets: element.defaultWidgets,
         selectedOrIndex: element.selectedOrIndex,
      });
   }

   // Score all values and attach the highest-scoring widget of the current mode's kind. Only the
   // data-derived values (indices below dataValueCount) are (re-)scored here: the freshly-seeded
   // default values appended above already carry the property's default widgets, and a seeded
   // nested value may be a blank/IRI node not yet materialised in the data graph, so re-scoring it
   // would find no widgets and wrongly reset it to "none".
   element.values = await Promise.all(element.values.map(async (value, index) => {
      if (index >= dataValueCount) {
         return value;
      }
      const scores = await score(value.value, dataGraph, property, shapesGraph, widgetScoringGraph, renderer.labelConfig);
      value.widgets = forMode(scores);
      value.selectedWidget = value.widgets[0]?.widget.value.value;
      return value;
   }));

   return element;
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
         // The selected widget is the DetailsEditor in edit mode and the DetailsViewer in view mode.
         if (value.class && (value.selectedWidget === shui('DetailsEditor') || value.selectedWidget === shui('DetailsViewer'))) {
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
