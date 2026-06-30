import type {LabeledValue, Path, RootRenderSlot, TailwindClasses, UIComponent, UIComponentValue} from "../types.ts";
import {html, nothing, type TemplateResult} from "lit";
import {twMerge} from 'tailwind-merge';
import {rdf, RDF as RDF_, SH, shui, XSD, xsd} from "../core/namespaces.ts";
import type {Quad_Object, Quad_Subject} from "rdf-js";
import * as RDF from "rdf-js";
import {DataFactory} from "rdf-data-factory";
import {findTailwindHeightValue, findTailwindMarginBottomValue} from "./tailwind.ts";
import type {Literal, Term} from "@rdfjs/types";
import {expandPrefixedIRI, mutateTerm} from "../core/rdf.ts";
import {ShaclRenderer} from "../shacl-renderer.ts";
import {toLabeledValue} from "../core/labels.ts";
import {cloneUiComponent} from "../core/clone.ts";
import type {RdfStore} from "rdf-stores";
import {until} from 'lit/directives/until.js';
import DOMPurify from 'dompurify';

const df: RDF.DataFactory = new DataFactory();

/** Sanitize an HTML string before it is bound into the DOM or stored as an rdf:HTML literal. */
function sanitizeHtml(value: string): string {
   return DOMPurify.sanitize(value);
}

/** Allow only http(s)/mailto links, blocking javascript:/data: schemes from sh:or rich-text links. */
function isSafeLinkUrl(url: string): boolean {
   try {
      return ['http:', 'https:', 'mailto:'].includes(new URL(url, window.location.href).protocol);
   } catch {
      return false;
   }
}

// ---------------------------------------------------------------------------
// Unified root-level rendering: base components + sh:or sections, in order
// ---------------------------------------------------------------------------

/**
 * Renders the interleaved list of base `sh:property` components and root-level
 * `sh:or` section cards in the correct `sh:order`-based sequence.
 *
 * Slot kinds:
 *  - `'component'`  – a single ungrouped UIComponent rendered normally.
 *  - `'group'`      – a set of UIComponents sharing a sh:group, rendered as a flex row.
 *  - `'orSection'`  – a root-level sh:or section with an inline variant selector
 *                     followed by the currently selected option's sh:property fields.
 */
export function renderRootSlots(
   renderer: ShaclRenderer,
   renderSlots: RootRenderSlot[],
   classes: TailwindClasses,
): TemplateResult {
   return html`
       ${renderSlots.map(slot => {
           if (slot.kind === 'component') {
               return renderUIComponent(renderer, slot.component, classes);
           }

           if (slot.kind === 'group') {
               const group = slot.components[0].group!;
               return html`
                   <div class="${twMerge(classes.groupClass)}">
                       <h2 class="${twMerge(classes.groupLabelClass)}">${group.label}</h2>
                       ${slot.components.map(c => html`
                           <div class="${twMerge(classes.groupElementClass)}">
                               ${renderUIComponent(renderer, c, classes)}
                           </div>
                       `)}
                   </div>
               `;
           }

           // ── orSection ────────────────────────────────────────────────────
           const {section, groupIndex} = slot;
           const {group} = section;

           // Single option – no selector needed; just render the fields.
           if (group.options.length < 2) {
               return section.components.length > 0
                  ? renderUIComponents(renderer, section.components, classes)
                  : nothing;
           }

           const key = group.orListNode.value;
           const open = renderer.rootOrSelectOpen[key] ?? false;
           const selected = group.options[group.selectedIndex];

           return html`
               <div class="flex gap-3 mb-4">
                   <!-- Thin left accent bar that visually connects selector + fields -->
                   <div class="w-0.5 bg-zinc-200 dark:bg-zinc-700 rounded-full self-stretch shrink-0"></div>

                   <div class="flex-1 min-w-0">
                       <!-- Inline variant selector – intentionally small and unobtrusive -->
                       <div class="relative mb-3">
                           <button class="inline-flex items-center gap-1.5 text-sm text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 cursor-pointer transition-colors"
                                   @click="${() => renderer.setRootOrSelectOpen(key, !open)}">
                               <span class="font-medium">
                                   ${selected?.label ?? `Option ${group.selectedIndex + 1}`}
                               </span>
                               <svg class="w-3.5 h-3.5 opacity-60"
                                    xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"
                                    stroke="currentColor" stroke-width="2.5">
                                   <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7"/>
                               </svg>
                           </button>

                           <!-- Dropdown (description shown here only, not below the trigger) -->
                           ${open ? html`
                               <ul class="${twMerge(classes.orSelectorDropdownClass, 'absolute z-50 min-w-48 mt-1')}">
                                   ${group.options.map((option, optionIndex) => html`
                                       <li class="${twMerge(
                                               classes.orSelectorOptionClass,
                                               optionIndex === group.selectedIndex
                                                       ? classes.orSelectorOptionSelectedClass
                                                       : ''
                                       )}"
                                           @mousedown="${() => renderer.selectRootOrOption(groupIndex, optionIndex)}">
                                           <div class="${twMerge(classes.orSelectorLabelClass)}">
                                               ${option.label ?? `Option ${optionIndex + 1}`}
                                           </div>
                                           ${option.description ? html`
                                               <div class="${twMerge(classes.orSelectorDescriptionClass)}">
                                                   ${option.description}
                                               </div>
                                           ` : nothing}
                                       </li>
                                   `)}
                               </ul>
                           ` : nothing}
                       </div>

                       <!-- Fields of the currently selected option -->
                       ${section.components.length > 0
                          ? renderUIComponents(renderer, section.components, classes)
                          : nothing}
                   </div>
               </div>
           `;
       })}
   `;
}

export function renderUIComponents(renderer: ShaclRenderer, uiComponents: UIComponent[], classes: TailwindClasses): TemplateResult {
   const grouped = new Map<string | undefined, UIComponent[]>();

   for (const component of uiComponents) {
      const key = component.group?.iri.value;
      if (!grouped.has(key)) {
         grouped.set(key, []);
      }
      grouped.get(key)!.push(component);
   }

   return html`
       ${Array.from(grouped.entries()).map(([_, components]) => {
           const group = components[0].group;

           if (!group) {
               return components.map(c =>
                       renderUIComponent(renderer, c, classes)
               );
           }

           return html`
               <div class="${twMerge(classes.groupClass)}">
                   <h2 class="${twMerge(classes.groupLabelClass)}">
                       ${group.label}
                   </h2>

                   ${components.map(c => html`
                       <div class="${twMerge(classes.groupElementClass)}">
                           ${renderUIComponent(renderer, c, classes)}
                       </div>
                   `)}
               </div>
           `;
       })}
   `;
}
export function renderUIComponent(renderer: ShaclRenderer, uiComponent: UIComponent, classes: TailwindClasses) {
   return html`
       <div class="mb-4">
           ${renderPlusIcon(renderer, uiComponent, classes)}

           ${renderLabel(uiComponent, classes)}

           ${renderDescription(uiComponent, classes)}

           ${uiComponent.values.map((value, index) => {
               const key = `${uiComponent.uuid}-${uiComponent.focusNode?.value}-${value.path.path}-${index}`;
               const open = renderer.alternativePathSelectOpen[key] ?? false;

               const isHasValue = !!uiComponent.hasValue && index === 0;

               return html`

                   <div class="flex items-start gap-2">
                       <div class="flex-1 min-w-0">
                           ${isHasValue ? nothing : renderOrSelectorForValue(renderer, uiComponent, value, index, classes)}
                           ${renderWidget(renderer, uiComponent, value, index, classes, isHasValue)}
                       </div>

                       <div class="shrink-0 mt-2">
                           ${renderSelectWidgetIcon(renderer, uiComponent, value, index, classes)}
                       </div>
                   </div>

                   ${uiComponent.paths.length > 1 ? html`
                       <p class="${twMerge(classes.alternativePathDescriptionClass)}"
                          @click="${() => renderer.setAlternativePathSelectOpen(key, !open)}">
                           Click to choose an alternative path.
                       </p>

                       ${open ? html`
                           <ul class="${twMerge(classes.alternativePathSelectClass)}">
                               ${uiComponent.paths.map(path => html`
                                   <li class="${twMerge(classes.alternativePathOptionClass, path.path === value.path.path ? classes.alternativePathOptionSelectedClass : '')}"
                                       @click="${() => {
                                           // Find all quads for the current path and re-add them with the new path.
                                           if (uiComponent.focusNode && value.path) {
                                               const oldPathTerm = df.namedNode(value.path.path);
                                               const newPathTerm = df.namedNode(path.path);
                                               if (value.path.type === "predicate") {
                                                   const quads = renderer.dataStore?.getQuads(uiComponent.focusNode as Quad_Subject, oldPathTerm, null);
                                                   quads?.forEach(quad => {
                                                       renderer.dataStore?.addQuad(df.quad(quad.subject, newPathTerm, quad.object));
                                                       renderer.dataStore?.removeQuad(quad);
                                                   });
                                               } else if (value.path.type === "inverse") {
                                                   const quads = renderer.dataStore?.getQuads(null, oldPathTerm, uiComponent.focusNode as Quad_Object);
                                                   quads?.forEach(quad => {
                                                       renderer.dataStore?.addQuad(df.quad(quad.subject, newPathTerm, quad.object));
                                                       renderer.dataStore?.removeQuad(quad);
                                                   });
                                               } else {
                                                   console.warn(`Unsupported path type ${value.path.type} for component ${uiComponent.uuid}, cannot update path in dataStore`);
                                               }
                                           } else {
                                               console.warn(`Cannot update path in dataStore for component ${uiComponent.uuid} because it is missing a focus node or current path.`);
                                           }
                                           value.path = path;
                                           renderer.setAlternativePathSelectOpen(key, false);
                                           renderer.rerender();
                                       }}">
                                       ${path.path}
                                   </li>
                               `)}
                           </ul>
                       ` : nothing}
                   ` : nothing}
               `;
           })}
       </div>
   `;
}

function renderWidget(renderer: ShaclRenderer, uiComponent: UIComponent, value: UIComponentValue, index: number, classes: TailwindClasses, disabled: boolean = false) {
   switch (value.selectedWidget) {
      case shui("AutoCompleteEditor"):
         return renderAutoCompleteEditor(renderer, uiComponent, value, index, classes, disabled);
      case shui("BlankNodeEditor"):
         return renderBlankNodeEditor(renderer, uiComponent, value, index, classes, disabled);
      case shui("BooleanEditor"):
         return renderBooleanEditor(renderer, uiComponent, value, index, classes, disabled);
      case shui("DatePickerEditor"):
         return renderDatePickerEditor(renderer, uiComponent, value, index, classes, disabled);
      case shui("DateTimePickerEditor"):
         return renderDateTimePickerEditor(renderer, uiComponent, value, index, classes, disabled);
      case shui("DetailsEditor"):
         return renderDetailsEditor(renderer, uiComponent, value, index, classes, disabled);
      case shui("EnumSelectEditor"):
         return renderEnumSelectEditor(renderer, uiComponent, value, index, classes, disabled);
      case shui("InstancesSelectEditor"):
         return renderInstancesSelectEditor(renderer, uiComponent, value, index, classes, disabled);
      case shui("IRIEditor"):
         return renderIRIEditor(renderer, uiComponent, value, index, classes, disabled);
      case shui("NumberFieldEditor"):
         return renderNumberFieldEditor(renderer, uiComponent, value, index, classes, disabled);
      case shui("RichTextEditor"):
         return renderRichTextEditor(renderer, uiComponent, value, index, classes, disabled);
      case shui("SubClassEditor"):
         return renderSubClassEditor(renderer, uiComponent, value, index, classes, disabled);
      case shui("TextAreaEditor"):
         return renderTextAreaEditor(renderer, uiComponent, value, index, classes, disabled);
      case shui("TextAreaWithLangEditor"):
         return renderTextAreaWithLangEditor(renderer, uiComponent, value, index, classes, disabled);
      case shui("TextFieldEditor"):
         return renderTextFieldEditor(renderer, uiComponent, value, index, classes, disabled);
      case shui("TextFieldWithLangEditor"):
         return renderTextFieldWithLangEditor(renderer, uiComponent, value, index, classes, disabled);
      default:
         return html`
             <div class="relative">
                 <label class="${twMerge(classes.labelClass)}">
                     ${uiComponent.label} (${value.path.path}) - Unsupported widget:
                     ${value.selectedWidget ?? 'none'}
                 </label>
                 ${disabled ? nothing : renderXIcon(uiComponent, {
                     ...classes,
                     xIconClass: twMerge(classes.xIconClass, 'mt-0')
                 }, () => {
                     renderer.removeFromDataStore(uiComponent.focusNode, value.path, value.value);
                     uiComponent.values.splice(index, 1);
                     renderer.rerender();
                 })}
             </div>
         `;
   }
}

function renderDescription(uiComponent: UIComponent, classes: TailwindClasses) {
   return uiComponent.description ? html`
       <p class="${twMerge(classes.descriptionClass)}">
           ${uiComponent.description}
       </p>
   ` : nothing;
}

/**
 * Returns a human-readable label for an or-option at the given index.
 */
async function getOrOptionLabel(uiComponent: UIComponent, index: number, dataGraph: RdfStore, shapesGraph: RdfStore): Promise<LabeledValue> {
   const {orNode, orDatatype, orClass} = uiComponent;
   if (orNode) {
      const labeledValue = await toLabeledValue(orNode[index]?.node, dataGraph, shapesGraph, false);
      const iri = orNode[index]?.node?.value ?? '';
      if (labeledValue.label === iri) {
         labeledValue.label = iri.split('#').pop()?.split('/').pop() || `Option ${index + 1}`;
      }
      return labeledValue
   } else if (orClass) {
      return orClass[index]?.classValue?.value;
   } else if (orDatatype) {
      const dt = orDatatype[index]?.datatype ?? '';
      return {
         value: dt ? df.namedNode(dt) : df.blankNode(),
         label: dt.split('#').pop()?.split('/').pop() || dt || `Option ${index + 1}`
      };
   }
   return {
      value: df.blankNode(),
      label: `Option ${index + 1}`
   };
}

/**
 * Renders a per-value dropdown that lets the user switch the sh:or option for one specific value.
 * When the option changes the correct children are swapped in for that value slot.
 */
function renderOrSelectorForValue(renderer: ShaclRenderer, uiComponent: UIComponent, value: UIComponentValue, valueIndex: number, classes: TailwindClasses) {
   const optionCount = (uiComponent.orNode ?? uiComponent.orDatatype ?? uiComponent.orClass)?.length ?? 0;
   if (optionCount < 2) return nothing;

   const key = `${uiComponent.uuid}-or-${valueIndex}`;
   const open = renderer.orSelectOpen[key] ?? false;
   const selectedIndex = value.selectedOrIndex ?? 0;
   const indices = Array.from({length: optionCount}, (_, i) => i);

   return html`
       <div class="relative mb-2">
           <!-- Small chip-style trigger – shows the selected type without occupying a full input row -->
           <div class="inline-flex items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-700/60 rounded px-2 py-0.5 cursor-pointer hover:bg-zinc-200 dark:hover:bg-zinc-600 transition-colors mb-2"
                @click="${() => renderer.setOrSelectOpen(key, !open)}">
               <span>${until(getOrOptionLabel(uiComponent, selectedIndex, renderer.dataStore!, renderer.shapesStore!).then(res => res.label))}</span>
               <svg class="w-3 h-3 opacity-60"
                    xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"
                    stroke="currentColor" stroke-width="2.5">
                   <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7"/>
               </svg>
           </div>

           ${open ? html`
               <ul class="${twMerge(classes.orSelectorDropdownClass, 'absolute z-50 w-full mt-1')}">
                   ${indices.map(index => {
                      const labeledValue = getOrOptionLabel(uiComponent, index, renderer.dataStore!, renderer.shapesStore!);
                      return html`
                          <li class="${twMerge(
                                  classes.orSelectorOptionClass,
                                  index === selectedIndex ? classes.orSelectorOptionSelectedClass : ''
                          )}"
                              @mousedown="${() => {
                                  value.selectedOrIndex = index;

                                  // For orNode: rebuild children for this specific value using the
                                  // newly selected node shape. Re-use pre-built children where available
                                  // (values that existed in the data graph at construction time), and
                                  // fall back to cloning defaultChild for values added afterward.
                                  if (uiComponent.orNode && uiComponent.orNode[index]) {
                                      const orOption = uiComponent.orNode[index];
                                      const existingChildren = orOption.children?.[valueIndex];
                                      const newChildren = existingChildren !== undefined
                                              ? existingChildren
                                              : (orOption.defaultChild ?? []).map(child => {
                                                  const cloned = cloneUiComponent(child);
                                                  cloned.focusNode = value.value;
                                                  return cloned;
                                              });
                                      if (!uiComponent.children) uiComponent.children = [];
                                      uiComponent.children[valueIndex] = newChildren;
                                  }

                                  renderer.setOrSelectOpen(key, false);
                                  renderer.rerender();
                              }}">
                              <div class="${twMerge(classes.orSelectorLabelClass)}">
                                  ${until(labeledValue.then(res => res.label))}
                              </div>
                              ${until(labeledValue.then(res => res.description)) ? html`
                                  <div class="${twMerge(classes.orSelectorDescriptionClass)}">
                                      ${until(labeledValue.then(res => res.description))}
                                  </div>
                              ` : nothing}
                          </li>
                      `})}
               </ul>
           ` : nothing}
       </div>
   `;
}

function renderLabel(uiComponent: UIComponent, classes: TailwindClasses) {
   // Associate the label with the first value's input (ids are `${uuid}-${index}`),
   // giving click-to-focus and screen-reader association for single-value fields.
   return html`
       <label class="${twMerge(classes.labelClass)}" for="${uiComponent.uuid}-0">
           ${uiComponent.label}
       </label>
   `;
}

function renderPlusIcon(renderer: ShaclRenderer, uiComponent: UIComponent, classes: TailwindClasses) {
   let onClick: () => void;
   onClick = () => {
      const value = getDefaultTermForWidget(renderer, uiComponent.defaultWidget, uiComponent);
      const path = uiComponent.paths[0];
      uiComponent.values.push({
         value: value,
         path: path,
         class: uiComponent.classes?.[0]?.iri,
         widgets: uiComponent.defaultWidgets,
         selectedWidget: uiComponent.defaultWidget,
         selectedOrIndex: uiComponent.selectedOrIndex,
      });
      renderer.addToDataStore(uiComponent.focusNode, path, value);
      renderer.rerender();
   }

   return uiComponent.maxCount === undefined || uiComponent.values.length < uiComponent.maxCount ? html`
       <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5"
            stroke="currentColor" class="${twMerge(classes.plusIconClass)}" @click="${onClick}">
           <path stroke-linecap="round" stroke-linejoin="round"
                 d="M12 9v6m3-3H9m12 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"/>
       </svg>
   ` : nothing;
}

function renderXIcon(uiComponent: UIComponent, classes: TailwindClasses, onClick: () => void, floatRight: boolean = true) {
   const divClasses = twMerge(
      floatRight ? 'absolute inset-y-0 right-0 flex items-center pr-3' : 'mb-2',
      `h-${findTailwindHeightValue(twMerge(classes.xIconClass)) || '0'}`,
   );
   return (uiComponent.node ? (uiComponent.children?.length ?? 0) : uiComponent.values.length) > (uiComponent.minCount || 0) ? html`
       <div class="${divClasses}">
           <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5"
                stroke="currentColor" class="${twMerge(classes.xIconClass)}" @click="${onClick}">
               <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/>
           </svg>
       </div>
   ` : nothing;
}

function renderSelectWidgetIcon(renderer: ShaclRenderer, uiComponent: UIComponent, value: UIComponentValue, index: number, classes: TailwindClasses) {
   const key = `${uiComponent.uuid}-${uiComponent.focusNode?.value}-${value.path.path}-${index}`;
   const open = renderer.selectWidgetIconOpen?.[key] ?? false;

   const widgets = value.widgets ?? [];

   return html`
       <div class="relative inline-block">

           <svg
                   xmlns="http://www.w3.org/2000/svg"
                   fill="none"
                   viewBox="0 0 24 24"
                   stroke-width="1.5"
                   stroke="currentColor"
                   class="${twMerge(classes.selectWidgetIconClass)}"
                   @click="${() =>
                           renderer.setSelectWidgetIconOpen(key, !open)
                   }"
           >
               <path
                       stroke-linecap="round"
                       stroke-linejoin="round"
                       d="M10.5 6h9.75M10.5 6a1.5 1.5 0 1 1-3 0m3 0a1.5 1.5 0 1 0-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-9.75 0h9.75"
               />
           </svg>

           ${open && widgets.length > 0 ? html`
               <ul class="${twMerge(classes.selectWidgetDropdownClass)}">
                   ${widgets.map(widgetScore => {
                       const widget = widgetScore.widget;
                       const selected =
                               value.selectedWidget === widget.value.value;

                       return html`
                           <li
                                   class="${twMerge(classes.selectWidgetOptionClass, selected ? classes.selectWidgetOptionSelectedClass : '')}"
                                   @mousedown="${() => {
                                       value.selectedWidget = widget.value.value;
                                       renderer.setSelectWidgetIconOpen(key, false);
                                       renderer.rerender();
                                   }}"
                           >
                               <div class="flex items-center justify-between">
                                   <div>
                                       <div class="${twMerge(classes.selectWidgetLabelClass)}">
                                           ${widget.label}
                                       </div>

                                       ${widget.description ? html`
                                           <div class="${twMerge(classes.selectWidgetDescriptionClass)}">
                                               ${widget.description}
                                           </div>
                                       ` : nothing}
                                   </div>

                                   <div class="${twMerge(classes.selectWidgetScoreClass)}">
                                       ${widgetScore.score}
                                   </div>
                               </div>
                           </li>
                       `;
                   })}
               </ul>
           ` : nothing}

       </div>
   `;
}

function renderAutoCompleteEditor(renderer: ShaclRenderer, uiComponent: UIComponent, value: UIComponentValue, index: number, classes: TailwindClasses, disabled: boolean = false) {
   const key = `${uiComponent.uuid}-${uiComponent.focusNode?.value}-${value.path.path}-${index}`;

   const open = renderer.autoCompleteEditorOpen[key] ?? false;
   const filterText = renderer.autoCompleteEditorFilter[key] ?? '';

   const instances = uiComponent.instances ?? [];

   // If a value is already stored, find its label
   const storedKey = value.value.value;
   const selectedInstance = instances.find(
      i => i.value.value === storedKey
   );

   const displayText =
      filterText ||
      selectedInstance?.label ||
      '';

   const filteredInstances = instances.filter(instance =>
      instance.label.toLowerCase().includes(displayText.toLowerCase())
   );

   return html`
       <div class="${twMerge('relative', `mb-${findTailwindMarginBottomValue(twMerge(classes.globalFieldClass, classes.globalInputFieldClass, classes.autoCompleteEditorClass)) || '0'}`)}">
           <!-- Input -->
            <input
                    class="${twMerge(
                            classes.globalFieldClass,
                            classes.globalInputFieldClass,
                            classes.autoCompleteEditorClass,
                            'mb-0',
                            disabled ? 'cursor-not-allowed opacity-60' : ''
                    )}"
                    autocomplete="off"
                    .value="${displayText}"
                    placeholder="${uiComponent.label}"
                    ?disabled="${disabled}"
                    @focus="${() => renderer.setAutoCompleteEditorOpen(key, true)}"
                    @input="${(e: Event) => {
                        const input = e.target as HTMLInputElement;

                        // Update filter only (do NOT overwrite stored key yet)
                        renderer.setAutoCompleteEditorFilter(key, input.value);
                        renderer.setAutoCompleteEditorOpen(key, true);

                        // Clear stored key while typing
                        const newTerm = mutateTerm(value.value, '');
                        renderer.removeFromDataStore(uiComponent.focusNode, value.path, value.value);
                        renderer.addToDataStore(uiComponent.focusNode, value.path, newTerm);
                        value.value = newTerm;
                    }}"
                    @blur="${() => {
                        setTimeout(() => {
                            renderer.setAutoCompleteEditorOpen(key, false);
                            renderer.setAutoCompleteEditorFilter(key, '');
                        }, 150);
                    }}"
            />
            ${disabled ? nothing : renderXIcon(uiComponent, classes, () => {
                renderer.removeFromDataStore(uiComponent.focusNode, value.path, value.value, uiComponent.children?.[index]);
                uiComponent.values.splice(index, 1);
                renderer.rerender();
            })}

           <!-- Dropdown -->
           ${open && filteredInstances.length > 0 ? html`
               <ul class="${twMerge(classes.autoCompleteEditorDropdownClass)}">
                   ${filteredInstances.map(instance => html`
                       <li
                               class="${twMerge(classes.autoCompleteEditorOptionClass)}"
                               @mousedown="${() => {
                                   const newTerm = mutateTerm(value.value, instance.value.value);
                                   renderer.removeFromDataStore(uiComponent.focusNode, value.path, value.value);
                                   renderer.addToDataStore(uiComponent.focusNode, value.path, newTerm);
                                   value.value = newTerm;
                                   renderer.setAutoCompleteEditorFilter(key, instance.label);
                                   renderer.setAutoCompleteEditorOpen(key, false);
                               }}"
                       >
                           <div class="${twMerge(classes.autoCompleteEditorLabelClass)}">
                               ${instance.label}
                           </div>

                           ${instance.description ? html`
                               <div class="${twMerge(classes.autoCompleteEditorDescriptionClass)}">
                                   ${instance.description}
                               </div>
                           ` : nothing}
                       </li>
                   `)}
               </ul>
           ` : ''}

       </div>
   `;
}

function renderBlankNodeEditor(renderer: ShaclRenderer, uiComponent: UIComponent, value: UIComponentValue, index: number, classes: TailwindClasses, disabled: boolean = false) {
   return html`
       <div class="${twMerge('relative', `mb-${findTailwindMarginBottomValue(twMerge(classes.globalFieldClass, classes.globalInputFieldClass, classes.autoCompleteEditorClass)) || '0'}`)}">
           <input
                   class="${twMerge(
                           classes.globalFieldClass,
                           classes.globalInputFieldClass,
                           classes.blankNodeEditorClass,
                           'mb-0'
                   )}"
                   autocomplete="off"
                   .value="${value.value.value ?? ''}"
                   placeholder="${uiComponent.label}"
                   disabled
           />
           ${disabled ? nothing : renderXIcon(uiComponent, classes, () => {
               renderer.removeFromDataStore(uiComponent.focusNode, value.path, value.value, uiComponent.children?.[index]);
               uiComponent.values.splice(index, 1);
               renderer.rerender();
           })}
       </div>
   `;
}

function renderBooleanEditor(renderer: ShaclRenderer, uiComponent: UIComponent, value: UIComponentValue, index: number, classes: TailwindClasses, disabled: boolean = false) {
   return html`
       <div class="${twMerge('relative', `mb-${findTailwindMarginBottomValue(twMerge(classes.labelClass, classes.booleanEditorLabelClass)) || '0'}`)}">
           <label class="${twMerge(classes.labelClass, classes.booleanEditorLabelClass)}"
                  for="${uiComponent.uuid}-${index}">
               <input
                       class="${twMerge(classes.globalFieldClass, classes.booleanEditorClass, 'mb-0')}"
                       id="${uiComponent.uuid}-${index}"
                       type="checkbox"
                       ?checked="${value.value.value === "true"}"
                       ?disabled="${disabled}"
                       @change="${(e: Event) => {
                           const input = e.target as HTMLInputElement;
                           const newTerm = mutateTerm(value.value, input.checked ? "true" : "false");
                           renderer.removeFromDataStore(uiComponent.focusNode, value.path, value.value);
                           renderer.addToDataStore(uiComponent.focusNode, value.path, newTerm);
                           value.value = newTerm;
                       }}"
               />
               ${uiComponent.label}
           </label>
           ${disabled ? nothing : renderXIcon(uiComponent, {...classes, xIconClass: twMerge(classes.xIconClass, 'mt-0')}, () => {
               renderer.removeFromDataStore(uiComponent.focusNode, value.path, value.value, uiComponent.children?.[index]);
               uiComponent.values.splice(index, 1);
               renderer.rerender();
           })}
       </div>
   `;
}

function renderDatePickerEditor(renderer: ShaclRenderer, uiComponent: UIComponent, value: UIComponentValue, index: number, classes: TailwindClasses, disabled: boolean = false) {
   return html`
       <div class="${twMerge('relative', `mb-${findTailwindMarginBottomValue(twMerge(classes.globalFieldClass, classes.globalInputFieldClass, classes.datePickerEditorClass)) || '0'}`)}">
           <input
                   class="${twMerge(classes.globalFieldClass, classes.globalInputFieldClass, classes.datePickerEditorClass, 'mb-0', disabled ? 'cursor-not-allowed opacity-60' : '')}"
                   id="${uiComponent.uuid}-${index}"
                   ?required="${(uiComponent.minCount ?? 0) > 0}"
                   type="date"
                   min="${uiComponent.minInclusive ?? nothing}"
                   max="${uiComponent.maxInclusive ?? nothing}"
                   .value="${value.value.value ?? ''}"
                   ?disabled="${disabled}"
                   @change="${(e: Event) => {
                       const input = e.target as HTMLInputElement;
                       const newTerm = mutateTerm(value.value, input.value);
                       renderer.removeFromDataStore(uiComponent.focusNode, value.path, value.value);
                       renderer.addToDataStore(uiComponent.focusNode, value.path, newTerm);
                       value.value = newTerm;
                   }}"
           />
           ${disabled ? nothing : renderXIcon(uiComponent, classes, () => {
               renderer.removeFromDataStore(uiComponent.focusNode, value.path, value.value, uiComponent.children?.[index]);
               uiComponent.values.splice(index, 1);
               renderer.rerender();
           })}
       </div>
   `;
}

function renderDateTimePickerEditor(renderer: ShaclRenderer, uiComponent: UIComponent, value: UIComponentValue, index: number, classes: TailwindClasses, disabled: boolean = false) {
   return html`
       <div class="${twMerge('relative', `mb-${findTailwindMarginBottomValue(twMerge(classes.globalFieldClass, classes.globalInputFieldClass, classes.dateTimePickerEditorClass)) || '0'}`)}">
           <input
                   class="${twMerge(classes.globalFieldClass, classes.globalInputFieldClass, classes.dateTimePickerEditorClass, 'mb-0', disabled ? 'cursor-not-allowed opacity-60' : '')}"
                   id="${uiComponent.uuid}-${index}"
                   ?required="${(uiComponent.minCount ?? 0) > 0}"
                   type="datetime-local"
                   min="${uiComponent.minInclusive ?? nothing}"
                   max="${uiComponent.maxInclusive ?? nothing}"
                   .value="${value.value.value ?? ''}"
                   ?disabled="${disabled}"
                   @change="${(e: Event) => {
                       const input = e.target as HTMLInputElement;
                       const newTerm = mutateTerm(value.value, input.value);
                       renderer.removeFromDataStore(uiComponent.focusNode, value.path, value.value);
                       renderer.addToDataStore(uiComponent.focusNode, value.path, newTerm);
                       value.value = newTerm;
                   }}"
           />
           ${disabled ? nothing : renderXIcon(uiComponent, classes, () => {
               renderer.removeFromDataStore(uiComponent.focusNode, value.path, value.value, uiComponent.children?.[index]);
               uiComponent.values.splice(index, 1);
               renderer.rerender();
           })}
       </div>
   `;
}

function renderDetailsEditor(renderer: ShaclRenderer, uiComponent: UIComponent, value: UIComponentValue, index: number, classes: TailwindClasses, disabled: boolean = false) {
   const childComponents = uiComponent.children ? (uiComponent.children[index] ?? []) : [];
   return html`
       <div class="${twMerge(classes.detailsEditorClass)}">
           ${disabled ? nothing : renderXIcon(uiComponent, classes, () => {
               uiComponent.children!.splice(index, 1);
               renderer.removeFromDataStore(uiComponent.focusNode, value.path, value.value, childComponents);
               uiComponent.values.splice(index, 1);
               renderer.rerender();
           }, false)}

           ${uiComponent.classes && uiComponent.classes.length > 1 ? renderDetailsClassSelect(renderer, uiComponent, value, index, classes) : nothing}

           ${renderUIComponents(renderer, childComponents, classes)}
       </div>
   `;
}

function renderDetailsClassSelect(renderer: ShaclRenderer, uiComponent: UIComponent, value: UIComponentValue, index: number, classes: TailwindClasses) {
   const key = `${uiComponent.uuid}-${uiComponent.focusNode?.value}-${value.path.path}-${index}`;

   const open = renderer.detailsClassSelectOpen[key] ?? false;
   const filterText = renderer.detailsClassSelectFilter[key] ?? '';

   const classOptions = uiComponent.classes ?? [];

   // If a value is already stored, find its label
   const storedKey = value.class?.value;
   const selectedClass = classOptions.find(
      c => c.value.value.value === storedKey
   );

   const displayText =
      filterText ||
      selectedClass?.value.label ||
      '';

   const filteredClasses = classOptions.filter(c =>
      c.value.label.toLowerCase().includes(displayText.toLowerCase())
   );

   return html`
       <div class="${twMerge('relative', `mb-${findTailwindMarginBottomValue(twMerge(classes.globalFieldClass, classes.globalInputFieldClass, classes.detailsClassSelectClass)) || '0'}`)}">
           <!-- Input -->
           <input
                   class="${twMerge(
                           classes.globalFieldClass,
                           classes.globalInputFieldClass,
                           classes.detailsClassSelectClass,
                           'mb-0'
                   )}"
                   autocomplete="off"
                   .value="${displayText}"
                   placeholder="Select class for details"
                   @focus="${() => renderer.setDetailsClassSelectOpen(key, true)}"
                   @input="${(e: Event) => {
                       const input = e.target as HTMLInputElement;

                       // Update filter only (do NOT overwrite stored key yet)
                       renderer.setDetailsClassSelectFilter(key, input.value);
                       renderer.setDetailsClassSelectOpen(key, true);

                       // Clear stored key while typing
                       const newTerm = mutateTerm(value.class ?? df.namedNode(''), '');
                       const path: Path = {path: rdf('type'), type: 'predicate'};
                       renderer.removeFromDataStore(value.value, path, value.class);
                       renderer.addToDataStore(value.value, path, newTerm);
                       value.class = newTerm;
                   }}"
                   @blur="${() => {
                       setTimeout(() => {
                           renderer.setDetailsClassSelectOpen(key, false);
                           renderer.setDetailsClassSelectFilter(key, '');
                       }, 150);
                   }}"
           />

           <!-- Dropdown -->
           ${open && filteredClasses.length > 0 ? html`
               <ul class="${twMerge(classes.detailsClassSelectDropdownClass)}">
                   ${filteredClasses.map(c => html`
                       <li
                               class="${twMerge(classes.detailsClassSelectOptionClass)}"
                               @mousedown="${() => {
                                   // Update the rdf:type triple.
                                   const newTerm = mutateTerm(value.class ?? df.namedNode(''), c.value.value.value);
                                   const path: Path = {path: rdf('type'), type: 'predicate'};
                                   renderer.removeFromDataStore(value.value, path, value.class);
                                   renderer.addToDataStore(value.value, path, newTerm);
                                   value.class = newTerm;

                                   // Update the children of the details editor to match the selected class.
                                   const classValue = uiComponent.classes?.find(cv => cv.value.value.value === c.value.value.value);
                                   if (classValue) {
                                       const newChildren = cloneUiComponent(classValue.children ?? []);
                                       for (const child of newChildren) {
                                           child.focusNode = uiComponent.values[index].value;
                                       }
                                       renderer.removeFromDataStore(uiComponent.focusNode, path, undefined, uiComponent.children![index]);
                                       for (const child of newChildren) {
                                          for (const value of child.values) {
                                              renderer.addToDataStore(child.focusNode, value.path, value.value);
                                          }
                                           //renderer.removeFromDataStore(child.focusNode, child.paths[0], child.values[0].value, child.children);
                                       }
                                       uiComponent.children![index] = newChildren;
                                   } else {
                                       uiComponent.children = [[]];
                                   }

                                   // Close the dropdown and update the filter text to match the selected class.
                                   renderer.setDetailsClassSelectFilter(key, c.value.label);
                                   renderer.setDetailsClassSelectOpen(key, false);
                               }}"
                       >
                           <div class="${twMerge(classes.detailsClassSelectLabelClass)}">
                               ${c.value.label}
                           </div>

                           ${c.value.description ? html`
                               <div class="${twMerge(classes.detailsClassSelectDescriptionClass)}">
                                   ${c.value.description}
                               </div>
                           ` : nothing}
                       </li>
                   `)}
               </ul>
           ` : ''}
       </div>
   `;
}

function renderEnumSelectEditor(renderer: ShaclRenderer, uiComponent: UIComponent, value: UIComponentValue, index: number, classes: TailwindClasses, disabled: boolean = false) {
   const key = `${uiComponent.uuid}-${uiComponent.focusNode?.value}-${value.path.path}-${index}`;

   const open = !disabled && (renderer.enumSelectEditorOpen[key] ?? false);

   const options = uiComponent.options ?? [];

   const selectedOption = options.find(
      o => o.value.value === value.value.value
   );

   return html`
       <div class="${twMerge(
               'relative',
               `mb-${findTailwindMarginBottomValue(
                       twMerge(
                               classes.globalFieldClass,
                               classes.globalInputFieldClass,
                               classes.enumSelectEditorClass
                       )
               ) || '0'}`
       )}">

           <!-- Trigger button -->
           <div
                   id="${uiComponent.uuid}-${index}"
                   class="${twMerge(
                           classes.globalFieldClass,
                           classes.globalInputFieldClass,
                           classes.enumSelectEditorClass,
                           'appearance-none pr-10 mb-0 flex items-center',
                           disabled ? 'cursor-not-allowed opacity-60 pointer-events-none' : 'cursor-pointer'
                   )}"
                   @click="${() =>
                           renderer.setEnumSelectEditorOpen(key, !open)
                   }"
           >
                <span class="flex-1">
                    ${selectedOption?.label ?? uiComponent.label}
                </span>
           </div>

           <!-- Chevron icon -->
           <div class="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-8">
               <svg
                       class="${classes.enumSelectEditorIconClass}"
                       xmlns="http://www.w3.org/2000/svg"
                       fill="none"
                       viewBox="0 0 24 24"
                       stroke="currentColor"
                       stroke-width="2"
               >
                   <path
                           stroke-linecap="round"
                           stroke-linejoin="round"
                           d="M19 9l-7 7-7-7"
                   />
               </svg>
           </div>

           ${disabled ? nothing : renderXIcon(uiComponent, classes, () => {
               renderer.removeFromDataStore(uiComponent.focusNode, value.path, value.value, uiComponent.children?.[index]);
               uiComponent.values.splice(index, 1);
               renderer.rerender();
           })}

           <!-- Dropdown -->
           ${open ? html`
               <ul class="${twMerge(
                       classes.autoCompleteEditorDropdownClass,
                       'absolute z-50 w-full mt-1'
               )}">
                   ${options.map(option => html`
                       <li
                               class="${twMerge(
                                       classes.autoCompleteEditorOptionClass,
                                       option.value.value === value.value.value
                                               ? 'bg-gray-100'
                                               : ''
                               )}"
                               @mousedown="${() => {
                                   const newTerm = mutateTerm(value.value, option.value.value);
                                   renderer.removeFromDataStore(uiComponent.focusNode, value.path, value.value);
                                   renderer.addToDataStore(uiComponent.focusNode, value.path, newTerm);
                                   value.value = newTerm;
                                   renderer.setEnumSelectEditorOpen(key, false);
                               }}"
                       >
                           <div class="${twMerge(classes.autoCompleteEditorLabelClass)}">
                               ${option.label}
                           </div>

                           ${option.description ? html`
                               <div class="${twMerge(classes.autoCompleteEditorDescriptionClass)}">
                                   ${option.description}
                               </div>
                           ` : nothing}
                       </li>
                   `)}
               </ul>
           ` : ''}

       </div>
   `;
}

function renderInstancesSelectEditor(renderer: ShaclRenderer, uiComponent: UIComponent, value: UIComponentValue, index: number, classes: TailwindClasses, disabled: boolean = false) {
   const key = `${uiComponent.uuid}-${uiComponent.focusNode?.value}-${value.path.path}-${index}`;

   const open = !disabled && (renderer.instancesSelectEditorOpen?.[key] ?? false);

   const instances = uiComponent.instances ?? [];

   const selectedInstance = instances.find(
      i => i.value.value === value.value.value
   );

   return html`
       <div class="${twMerge(
               'relative',
               `mb-${findTailwindMarginBottomValue(
                       twMerge(
                               classes.globalFieldClass,
                               classes.globalInputFieldClass,
                               classes.instancesSelectEditorClass
                       )
               ) || '0'}`
       )}">

           <!-- Trigger -->
           <div
                   id="${uiComponent.uuid}-${index}"
                   class="${twMerge(
                           classes.globalFieldClass,
                           classes.globalInputFieldClass,
                           classes.instancesSelectEditorClass,
                           'appearance-none pr-10 mb-0 flex items-center',
                           disabled ? 'cursor-not-allowed opacity-60 pointer-events-none' : 'cursor-pointer'
                   )}"
                   @click="${() =>
                           renderer.setInstancesSelectEditorOpen?.(key, !open)
                   }"
           >
                <span class="flex-1">
                    ${selectedInstance?.label ?? ''}
                </span>
           </div>

           <!-- Chevron -->
           <div class="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-8">
               <svg
                       class="${classes.instancesSelectEditorIconClass}"
                       xmlns="http://www.w3.org/2000/svg"
                       fill="none"
                       viewBox="0 0 24 24"
                       stroke="currentColor"
                       stroke-width="2"
               >
                   <path
                           stroke-linecap="round"
                           stroke-linejoin="round"
                           d="M19 9l-7 7-7-7"
                   />
               </svg>
           </div>

           ${disabled ? nothing : renderXIcon(uiComponent, classes, () => {
               renderer.removeFromDataStore(uiComponent.focusNode, value.path, value.value, uiComponent.children?.[index]);
               uiComponent.values.splice(index, 1);
               renderer.rerender();
           })}

           <!-- Dropdown -->
           ${open ? html`
               <ul class="${twMerge(
                       classes.instancesSelectEditorDropdownClass,
                       'absolute z-50 w-full mt-1'
               )}">
                   ${instances.map(instance => html`
                       <li
                               class="${twMerge(
                                       classes.instancesSelectEditorOptionClass,
                                       instance.value.value === value.value.value
                                               ? 'bg-gray-100'
                                               : ''
                               )}"
                               @mousedown="${() => {
                                   const newTerm = mutateTerm(value.value, instance.value.value);
                                   renderer.removeFromDataStore(uiComponent.focusNode, value.path, value.value);
                                   renderer.addToDataStore(uiComponent.focusNode, value.path, newTerm);
                                   value.value = newTerm;
                                   renderer.setInstancesSelectEditorOpen?.(key, false);
                               }}"
                       >
                           <div class="${twMerge(classes.instancesSelectEditorLabelClass)}">
                               ${instance.label}
                           </div>

                           ${instance.description ? html`
                               <div class="${twMerge(classes.instancesSelectEditorDescriptionClass)}">
                                   ${instance.description}
                               </div>
                           ` : nothing}
                       </li>
                   `)}
               </ul>
           ` : ''}
       </div>
   `;
}

function renderIRIEditor(renderer: ShaclRenderer, uiComponent: UIComponent, value: UIComponentValue, index: number, classes: TailwindClasses, disabled: boolean = false) {
   return html`
       <div class="${twMerge('relative', `mb-${findTailwindMarginBottomValue(twMerge(classes.globalFieldClass, classes.globalInputFieldClass, classes.iriEditorClass)) || '0'}`)}">
           <input
                   class="${twMerge(classes.globalFieldClass, classes.globalInputFieldClass, classes.iriEditorClass, 'mb-0', disabled ? 'cursor-not-allowed opacity-60' : '')}"
                   id="${uiComponent.uuid}-${index}"
                   ?required="${(uiComponent.minCount ?? 0) > 0}"
                   type="url"
                   pattern="${uiComponent.pattern ?? nothing}"
                   .value="${value.value.value ?? ''}"
                   placeholder="${uiComponent.label}"
                   ?disabled="${disabled}"
                   @change="${async (e: Event) => {
                       const input = e.target as HTMLInputElement;
                       if (renderer.expandPrefixes) {
                           input.value = await expandPrefixedIRI(input.value);
                       }
                       const newTerm = mutateTerm(value.value, input.value);
                       renderer.removeFromDataStore(uiComponent.focusNode, value.path, value.value);
                       renderer.addToDataStore(uiComponent.focusNode, value.path, newTerm);
                       value.value = newTerm;
                   }}"
           />
           ${disabled ? nothing : renderXIcon(uiComponent, classes, () => {
               renderer.removeFromDataStore(uiComponent.focusNode, value.path, value.value, uiComponent.children?.[index]);
               uiComponent.values.splice(index, 1);
               renderer.rerender();
           })}
       </div>
   `;
}

function renderNumberFieldEditor(renderer: ShaclRenderer, uiComponent: UIComponent, value: UIComponentValue, index: number, classes: TailwindClasses, disabled: boolean = false) {
   return html`
       <div class="${twMerge('relative', `mb-${findTailwindMarginBottomValue(twMerge(classes.globalFieldClass, classes.globalInputFieldClass, classes.numberFieldEditorClass)) || '0'}`)}">
           <input
                   class="${twMerge(classes.globalFieldClass, classes.globalInputFieldClass, classes.numberFieldEditorClass, 'mb-0', disabled ? 'cursor-not-allowed opacity-60' : '')}"
                   id="${uiComponent.uuid}-${index}"
                   ?required="${(uiComponent.minCount ?? 0) > 0}"
                   type="number"
                   step="${getDataType(uiComponent, value) === xsd('integer') ? '1' : 'any'}"
                   inputmode="${getDataType(uiComponent, value) === xsd('integer') ? 'numeric' : 'decimal'}"
                   min="${uiComponent.minInclusive ?? nothing}"
                   max="${uiComponent.maxInclusive ?? nothing}"
                   placeholder="${uiComponent.label}"
                   .value="${value.value.value ?? ''}"
                   ?disabled="${disabled}"
                   @change="${(e: Event) => {
                       const input = e.target as HTMLInputElement;
                       const newTerm = mutateTerm(value.value, input.value);
                       renderer.removeFromDataStore(uiComponent.focusNode, value.path, value.value);
                       renderer.addToDataStore(uiComponent.focusNode, value.path, newTerm);
                       value.value = newTerm;
                   }}"
           />
           ${disabled ? nothing : renderXIcon(uiComponent, classes, () => {
               renderer.removeFromDataStore(uiComponent.focusNode, value.path, value.value, uiComponent.children?.[index]);
               uiComponent.values.splice(index, 1);
               renderer.rerender();
           })}
       </div>
   `;
}

function renderRichTextEditor(renderer: ShaclRenderer, uiComponent: UIComponent, value: UIComponentValue, index: number, classes: TailwindClasses, disabled: boolean = false) {
   const editorId = `rte-${uiComponent.uuid}-${index}`;

   // Track HTML mode per editor
   const htmlMode = renderer.richTextHtmlMode[editorId] ?? false;

   const exec = (command: string, arg?: string) => {
      const editor = renderer.renderRoot?.querySelector(
         `#${editorId}`
      ) as HTMLElement;

      if (!editor) return;

      editor.focus();
      document.execCommand(command, false, arg);
      value.value.value = sanitizeHtml(editor.innerHTML);
      renderer.rerender();
   };

   const insertImage = (file: File) => {
      const reader = new FileReader();
      reader.onload = () => {
         exec("insertImage", reader.result as string);
      };
      reader.readAsDataURL(file);
   };

   return html`
       <div class="${twMerge('relative', `mb-${findTailwindMarginBottomValue(twMerge(classes.globalFieldClass, classes.richTextEditorClass)) || '0'}`)}">
           <div class="${twMerge(
                   classes.globalFieldClass,
                   classes.richTextEditorClass,
                   'mb-0'
           )}">

               <!-- Toolbar -->
               <div class="${twMerge(classes.richTextEditorToolbarClass, disabled ? 'pointer-events-none opacity-40' : '')}">

                   <!-- Bold -->
                   <button type="button"
                           class="${twMerge(classes.richTextEditorButtonClass)}"
                           @click="${() => exec('bold')}">
                       B
                   </button>

                   <!-- Italic -->
                   <button type="button"
                           class="${twMerge(classes.richTextEditorButtonClass, 'italic')}"
                           @click="${() => exec('italic')}">
                       I
                   </button>

                   <!-- Underline -->
                   <button type="button"
                           class="${twMerge(classes.richTextEditorButtonClass, 'underline')}"
                           @click="${() => exec('underline')}">
                       U
                   </button>

                   <!-- Headings -->
                   <select class="${twMerge(classes.richTextEditorSelectClass)}"
                           @change="${(e: Event) => {
                               const val = (e.target as HTMLSelectElement).value;
                               exec('formatBlock', val);
                           }}">
                       <option value="p">Paragraph</option>
                       <option value="h1">H1</option>
                       <option value="h2">H2</option>
                       <option value="h3">H3</option>
                   </select>

                   <!-- Font family -->
                   <select class="${twMerge(classes.richTextEditorSelectClass)}"
                           @change="${(e: Event) => {
                               exec('fontName', (e.target as HTMLSelectElement).value);
                           }}">
                       <option value="Arial">Arial</option>
                       <option value="Times New Roman">Times</option>
                       <option value="Courier New">Courier</option>
                       <option value="Verdana">Verdana</option>
                   </select>

                   <!-- Font size -->
                   <select class="${twMerge(classes.richTextEditorSelectClass)}"
                           @change="${(e: Event) => {
                               exec('fontSize', (e.target as HTMLSelectElement).value);
                           }}">
                       <option value="3">Normal</option>
                       <option value="4">Large</option>
                       <option value="5">X-Large</option>
                   </select>

                   <!-- Text color -->
                   <input type="color"
                          class="w-8 h-8 border rounded cursor-pointer"
                          @input="${(e: Event) => {
                              exec('foreColor', (e.target as HTMLInputElement).value);
                          }}"/>

                   <!-- Lists -->
                   <button type="button"
                           class="${twMerge(classes.richTextEditorButtonClass)}"
                           @click="${() => exec('insertUnorderedList')}">
                       • List
                   </button>

                   <button type="button"
                           class="${twMerge(classes.richTextEditorButtonClass)}"
                           @click="${() => exec('insertOrderedList')}">
                       1. List
                   </button>

                   <!-- Alignment -->
                   <button type="button"
                           class="${twMerge(classes.richTextEditorButtonClass)}"
                           @click="${() => exec('justifyLeft')}">
                       <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5"
                            stroke="currentColor" class="size-5">
                           <path stroke-linecap="round" stroke-linejoin="round"
                                 d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25H12"/>
                       </svg>
                   </button>

                   <button type="button"
                           class="${twMerge(classes.richTextEditorButtonClass)}"
                           @click="${() => exec('justifyCenter')}">
                       <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5"
                            stroke="currentColor" class="size-5">
                           <path stroke-linecap="round" stroke-linejoin="round"
                                 d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5"/>
                       </svg>
                   </button>

                   <button type="button"
                           class="${twMerge(classes.richTextEditorButtonClass)}"
                           @click="${() => exec('justifyRight')}">
                       <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5"
                            stroke="currentColor" class="size-5">
                           <path stroke-linecap="round" stroke-linejoin="round"
                                 d="M3.75 6.75h16.5M3.75 12h16.5M12 17.25h8.25"/>
                       </svg>
                   </button>

                   <!-- Link -->
                   <button type="button"
                           class="${twMerge(classes.richTextEditorButtonClass)}"
                           @click="${() => {
                               const url = prompt('Enter URL');
                               if (url && isSafeLinkUrl(url)) exec('createLink', url);
                           }}">
                       <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5"
                            stroke="currentColor" class="size-5">
                           <path stroke-linecap="round" stroke-linejoin="round"
                                 d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244"/>
                       </svg>
                   </button>

                   <!-- Image upload -->
                   <label class="${twMerge(classes.richTextEditorButtonClass)}">
                       <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5"
                            stroke="currentColor" class="size-5">
                           <path stroke-linecap="round" stroke-linejoin="round"
                                 d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z"/>
                       </svg>
                       <input type="file" accept="image/*" class="hidden"
                              @change="${(e: Event) => {
                                  const file = (e.target as HTMLInputElement).files?.[0];
                                  if (file) insertImage(file);
                              }}">
                   </label>

                   <!-- HTML toggle -->
                   <button type="button"
                           class="${twMerge(classes.richTextEditorButtonClass, htmlMode ? 'bg-gray-200' : '')}"
                           @click="${() => {
                               renderer.richTextHtmlMode[editorId] = !htmlMode;
                               renderer.rerender();
                           }}">
                       <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5"
                            stroke="currentColor" class="size-5">
                           <path stroke-linecap="round" stroke-linejoin="round"
                                 d="M17.25 6.75 22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3-4.5 16.5"/>
                       </svg>
                   </button>
               </div>

               <!-- Editor -->
               ${htmlMode ? html`
                   <textarea
                           id="${editorId}"
                           class="${twMerge(classes.richTextEditorRawContentClass, disabled ? 'cursor-not-allowed opacity-60' : '')}"
                           .value="${value.value.value ?? ''}"
                           ?disabled="${disabled}"
                           @input="${(e: Event) => {
                               const el = e.target as HTMLTextAreaElement;
                               const newTerm = mutateTerm(value.value, el.value);
                               renderer.removeFromDataStore(uiComponent.focusNode, value.path, value.value);
                               renderer.addToDataStore(uiComponent.focusNode, value.path, newTerm);
                               value.value = newTerm;
                           }}"
                   ></textarea>
               ` : html`
                   <div
                           id="${editorId}"
                           contenteditable="${disabled ? 'false' : 'true'}"
                           class="${twMerge(classes.richTextEditorContentClass, disabled ? 'cursor-not-allowed opacity-60' : '')}"
                           .innerHTML="${sanitizeHtml(value.value.value ?? '')}"
                           @input="${(e: Event) => {
                               const el = e.target as HTMLElement;
                               const newTerm = mutateTerm(value.value, sanitizeHtml(el.innerHTML));
                               renderer.removeFromDataStore(uiComponent.focusNode, value.path, value.value);
                               renderer.addToDataStore(uiComponent.focusNode, value.path, newTerm);
                               value.value = newTerm;
                           }}"
                   ></div>
               `}

           </div>
           ${disabled ? nothing : renderXIcon(uiComponent, classes, () => {
               renderer.removeFromDataStore(uiComponent.focusNode, value.path, value.value, uiComponent.children?.[index]);
               uiComponent.values.splice(index, 1);
               renderer.rerender();
           })}
       </div>
   `;
}

function renderSubClassEditor(renderer: ShaclRenderer, uiComponent: UIComponent, value: UIComponentValue, index: number, classes: TailwindClasses, disabled: boolean = false) {
   const key = `${uiComponent.uuid}-${uiComponent.focusNode?.value}-${value.path.path}-${index}`;

   const open = !disabled && (renderer.subClassEditorOpen[key] ?? false);
   const filterText = renderer.subClassEditorFilter[key] ?? '';

   const subclasses = uiComponent.subclasses ?? [];

   // If a value is already stored, find its label
   const storedKey = value.value.value;
   const selectedSubclass = subclasses.find(
      i => i.value.value === storedKey
   );

   const displayText =
      filterText ||
      selectedSubclass?.label ||
      '';

   const filteredInstances = subclasses.filter(subclass =>
      subclass.label.toLowerCase().includes(displayText.toLowerCase())
   );

   return html`
       <div class="${twMerge('relative', `mb-${findTailwindMarginBottomValue(twMerge(classes.globalFieldClass, classes.globalInputFieldClass, classes.subClassEditorClass)) || '0'}`)}">
           <!-- Input -->
           <input
                   class="${twMerge(
                           classes.globalFieldClass,
                           classes.globalInputFieldClass,
                           classes.subClassEditorClass,
                           'mb-0',
                           disabled ? 'cursor-not-allowed opacity-60' : ''
                   )}"
                   autocomplete="off"
                   .value="${displayText}"
                   placeholder="${uiComponent.label}"
                   ?disabled="${disabled}"
                   @focus="${() => renderer.setSubClassEditorOpen(key, true)}"
                   @input="${(e: Event) => {
                       const input = e.target as HTMLInputElement;

                       // Update filter only (do NOT overwrite stored key yet)
                       renderer.setSubClassEditorFilter(key, input.value);
                       renderer.setSubClassEditorOpen(key, true);

                       // Clear stored key while typing
                       const newTerm = mutateTerm(value.value, '');
                       renderer.removeFromDataStore(uiComponent.focusNode, value.path, value.value);
                       renderer.addToDataStore(uiComponent.focusNode, value.path, newTerm);
                       value.value = newTerm;
                   }}"
                   @blur="${() => {
                       setTimeout(() => {
                           renderer.setSubClassEditorOpen(key, false);
                           renderer.setSubClassEditorFilter(key, '');
                       }, 150);
                   }}"
           />
           ${disabled ? nothing : renderXIcon(uiComponent, classes, () => {
               renderer.removeFromDataStore(uiComponent.focusNode, value.path, value.value, uiComponent.children?.[index]);
               uiComponent.values.splice(index, 1);
               renderer.rerender();
           })}

           <!-- Dropdown -->
           ${open && filteredInstances.length > 0 ? html`
               <ul class="${twMerge(classes.subClassEditorDropdownClass)}">
                   ${filteredInstances.map(instance => html`
                       <li
                               class="${twMerge(classes.subClassEditorOptionClass, instance.value.value === value.value.value ? classes.subClassEditorOptionSelectedClass : '')}"
                               @mousedown="${() => {
                                   const newTerm = mutateTerm(value.value, instance.value.value);
                                   renderer.removeFromDataStore(uiComponent.focusNode, value.path, value.value);
                                   renderer.addToDataStore(uiComponent.focusNode, value.path, newTerm);
                                   value.value = newTerm;
                                   renderer.setSubClassEditorFilter(key, instance.label);
                                   renderer.setSubClassEditorOpen(key, false);
                               }}"
                       >
                           <div class="${twMerge(classes.subClassEditorLabelClass)}">
                               ${instance.label}
                           </div>

                           ${instance.description ? html`
                               <div class="${twMerge(classes.subClassEditorDescriptionClass)}">
                                   ${instance.description}
                               </div>
                           ` : nothing}
                       </li>
                   `)}
               </ul>
           ` : ''}

       </div>
   `;
}

function renderTextAreaEditor(renderer: ShaclRenderer, uiComponent: UIComponent, value: UIComponentValue, index: number, classes: TailwindClasses, disabled: boolean = false) {
   return html`
       <div class="${twMerge('relative', `mb-${findTailwindMarginBottomValue(twMerge(classes.globalFieldClass, classes.globalInputFieldClass, classes.textAreaEditorClass)) || '0'}`)}">
           <textarea
                   class="${twMerge(classes.globalFieldClass, classes.globalInputFieldClass, classes.textAreaEditorClass, 'mb-0', disabled ? 'cursor-not-allowed opacity-60' : '')}"
                   id="${uiComponent.uuid}-${index}"
                   ?required="${(uiComponent.minCount ?? 0) > 0}"
                   rows="4"
                   placeholder="${uiComponent.label}"
                   ?disabled="${disabled}"
                   @change="${(e: Event) => {
                       const input = e.target as HTMLInputElement;
                       const newTerm = mutateTerm(value.value, input.value);
                       renderer.removeFromDataStore(uiComponent.focusNode, value.path, value.value);
                       renderer.addToDataStore(uiComponent.focusNode, value.path, newTerm);
                       value.value = newTerm;
                   }}"
           >${value.value.value ?? ''}</textarea>
           ${disabled ? nothing : renderXIcon(uiComponent, classes, () => {
               renderer.removeFromDataStore(uiComponent.focusNode, value.path, value.value, uiComponent.children?.[index]);
               uiComponent.values.splice(index, 1);
               renderer.rerender();
           })}
       </div>
   `;
}

function renderTextFieldEditor(renderer: ShaclRenderer, uiComponent: UIComponent, value: UIComponentValue, index: number, classes: TailwindClasses, disabled: boolean = false) {
   return html`
       <div class="${twMerge('relative', `mb-${findTailwindMarginBottomValue(twMerge(classes.globalFieldClass, classes.globalInputFieldClass, classes.textFieldEditorClass)) || '0'}`)}">
           <input
                   class="${twMerge(classes.globalFieldClass, classes.globalInputFieldClass, classes.textFieldEditorClass, 'mb-0', disabled ? 'cursor-not-allowed opacity-60' : '')}"
                   id="${uiComponent.uuid}-${index}"
                   type="text"
                   pattern="${uiComponent.pattern ?? nothing}"
                   ?required="${(uiComponent.minCount ?? 0) > 0}"
                   .value="${value.value.value ?? ''}"
                   placeholder="${uiComponent.label}"
                   ?disabled="${disabled}"
                   @change="${(e: Event) => {
                       const input = e.target as HTMLInputElement;
                       const newTerm = mutateTerm(value.value, input.value);
                       renderer.removeFromDataStore(uiComponent.focusNode, value.path, value.value);
                       renderer.addToDataStore(uiComponent.focusNode, value.path, newTerm);
                       value.value = newTerm;
                   }}"
           />
           ${disabled ? nothing : renderXIcon(uiComponent, classes, () => {
               renderer.removeFromDataStore(uiComponent.focusNode, value.path, value.value, uiComponent.children?.[index]);
               uiComponent.values.splice(index, 1);
               renderer.rerender();
           })}
       </div>
   `;
}

function renderTextFieldWithLangEditor(renderer: ShaclRenderer, uiComponent: UIComponent, value: UIComponentValue, index: number, classes: TailwindClasses, disabled: boolean = false) {
   // Just like a TextFieldEditor, but a grouped input with as second field, a small input for language tag
   return html`
       <div class="${twMerge('flex rounded-md shadow-sm', `mb-${findTailwindMarginBottomValue(twMerge(classes.globalFieldClass, classes.globalInputFieldClass)) || '0'}`)}">
           <!-- Literal value -->
           <input
                   id="${uiComponent.uuid}-${index}"
                   type="text"
                   pattern="${uiComponent.pattern ?? nothing}"
                   ?required="${(uiComponent.minCount ?? 0) > 0}"
                   .value="${value.value.value ?? ''}"
                   placeholder="${uiComponent.label}"
                   ?disabled="${disabled}"
                   class="${twMerge(
                           classes.globalFieldClass,
                           classes.globalInputFieldClass,
                           classes.textFieldEditorClass,
                           'rounded-r-none pr-3 mb-0',
                           disabled ? 'cursor-not-allowed opacity-60' : ''
                   )}"
                   @change="${(e: Event) => {
                       const input = e.target as HTMLInputElement;
                       const newTerm = mutateTerm(value.value, input.value);
                       renderer.removeFromDataStore(uiComponent.focusNode, value.path, value.value);
                       renderer.addToDataStore(uiComponent.focusNode, value.path, newTerm);
                       value.value = newTerm;
                   }}"
           />

           <!-- @ separator -->
           <span
                   class="${twMerge(
                           classes.globalFieldClass,
                           classes.globalInputFieldClass,
                           'rounded-none pr-3 items-center bg-gray-50 w-auto border-x-0 mb-0'
                   )}"
                   aria-hidden="true"
           >@</span>

           <!-- Language tag -->
           <div class="relative">
               <input
                       type="text"
                       ?required="${(uiComponent.minCount ?? 0) > 0}"
                       inputmode="latin"
                       pattern="[a-zA-Z-]*"
                       placeholder="Lang"
                       .value="${(value.value as Literal).language ?? ''}"
                       ?disabled="${disabled}"
                       class="${twMerge(
                               classes.globalFieldClass,
                               classes.globalInputFieldClass,
                               'w-25 rounded-l-none mb-0',
                               disabled ? 'cursor-not-allowed opacity-60' : ''
                       )}"
                       aria-label="Language tag"
                       @change="${(e: Event) => {
                           const input = e.target as HTMLInputElement;
                           const newTerm = mutateTerm(value.value, undefined, input.value);
                           renderer.removeFromDataStore(uiComponent.focusNode, value.path, value.value);
                           renderer.addToDataStore(uiComponent.focusNode, value.path, newTerm);
                           value.value = newTerm;
                       }}"
               />

               ${disabled ? nothing : renderXIcon(uiComponent, classes, () => {
                   renderer.removeFromDataStore(uiComponent.focusNode, value.path, value.value, uiComponent.children?.[index]);
                   uiComponent.values.splice(index, 1);
                   renderer.rerender();
               })}
           </div>
       </div>
   `;
}

function renderTextAreaWithLangEditor(renderer: ShaclRenderer, uiComponent: UIComponent, value: UIComponentValue, index: number, classes: TailwindClasses, disabled: boolean = false) {
   return html`
       <div class="${twMerge(
               'flex rounded-md shadow-sm',
               `mb-${findTailwindMarginBottomValue(
                       twMerge(
                               classes.globalFieldClass,
                               classes.globalInputFieldClass,
                               classes.textAreaEditorClass
                       )
               ) || '0'}`
       )}">

           <!-- Literal value (textarea) -->
           <textarea
                   id="${uiComponent.uuid}-${index}"
                   ?required="${(uiComponent.minCount ?? 0) > 0}"
                   rows="4"
                   placeholder="${uiComponent.label}"
                   ?disabled="${disabled}"
                   class="${twMerge(
                           classes.globalFieldClass,
                           classes.globalInputFieldClass,
                           classes.textAreaEditorClass,
                           'rounded-r-none pr-3 mb-0 resize-y',
                           disabled ? 'cursor-not-allowed opacity-60' : ''
                   )}"
                   @change="${(e: Event) => {
                       const input = e.target as HTMLTextAreaElement;
                       const newTerm = mutateTerm(value.value, input.value);
                       renderer.removeFromDataStore(uiComponent.focusNode, value.path, value.value);
                       renderer.addToDataStore(uiComponent.focusNode, value.path, newTerm);
                       value.value = newTerm;
                   }}"
           >${value.value.value ?? ''}</textarea>

           <!-- @ separator -->
           <span
                   class="${twMerge(
                           classes.globalFieldClass,
                           classes.globalInputFieldClass,
                           'rounded-none pr-3 items-center align-middle content-center bg-gray-50 w-auto border-x-0 mb-0'
                   )}"
                   aria-hidden="true"
           >@</span>

           <!-- Language tag -->
           <div class="relative">
               <input
                       type="text"
                       ?required="${(uiComponent.minCount ?? 0) > 0}"
                       inputmode="latin"
                       pattern="[a-zA-Z-]*"
                       placeholder="Lang"
                       .value="${(value.value as Literal).language ?? ''}"
                       ?disabled="${disabled}"
                       class="${twMerge(
                               classes.globalFieldClass,
                               classes.globalInputFieldClass,
                               'w-25 rounded-l-none mb-0 h-full',
                               disabled ? 'cursor-not-allowed opacity-60' : ''
                       )}"
                       @change="${(e: Event) => {
                           const input = e.target as HTMLInputElement;
                           const newTerm = mutateTerm(value.value, undefined, input.value);
                           renderer.removeFromDataStore(uiComponent.focusNode, value.path, value.value);
                           renderer.addToDataStore(uiComponent.focusNode, value.path, newTerm);
                           value.value = newTerm;
                       }}"
               />

               ${disabled ? nothing : renderXIcon(uiComponent, classes, () => {
                   renderer.removeFromDataStore(uiComponent.focusNode, value.path, value.value, uiComponent.children?.[index]);
                   uiComponent.values.splice(index, 1);
                   renderer.rerender();
               })}
           </div>
       </div>
   `;
}

export function getDefaultTermForWidget(renderer: ShaclRenderer, widget: string | undefined, uiComponent: UIComponent, addChildren: boolean = true, addToDatastore: boolean = true): Term {
   switch (widget) {
      case shui('AutoCompleteEditor'):
         return df.namedNode('');
      case shui('BlankNodeEditor'):
         return df.blankNode();
      case shui('BooleanEditor'):
         return df.literal('false', XSD('boolean'));
      case shui('DatePickerEditor'):
         return df.literal('', XSD('date'));
      case shui('DateTimePickerEditor'):
         return df.literal('', XSD('dateTime'));
      case shui('DetailsEditor'):
         const newFocusNode = uiComponent.nodeKind?.equals(SH('BlankNode')) || uiComponent.nodeKind?.equals(SH('BlankNodeOrLiteral'))
            ? df.blankNode()
            : (uiComponent.nodeKind?.equals(SH('IRI')) || uiComponent.nodeKind?.equals(SH('IRIOrLiteral'))
               ? df.namedNode(`urn:uuid:${crypto.randomUUID()}`)
               : renderer.preferSkolemizedBlankNodes ? df.namedNode(`urn:uuid:${crypto.randomUUID()}`) : df.blankNode());
         if (uiComponent.children != undefined && addChildren) {
            // If defaultChild is set on the uiComponent, use it as default children for the details editor
            // Otherwise, if class and classes are set on the uiComponent, find the classValue that matches the class and use its children as default children for the details editor
            let newChildComponents: UIComponent[] = []
            if (uiComponent.defaultChild) {
               newChildComponents = uiComponent.defaultChild.map(child => {
                  const clonedChild = cloneUiComponent(child);
                  clonedChild.focusNode = newFocusNode;
                  return clonedChild;
               });
            } else if (uiComponent.classes && uiComponent.classes.length > 0) {
               const classValue = uiComponent.classes[0];
               if (classValue) {
                  newChildComponents = classValue.children ? classValue.children.map(child => {
                     const clonedChild = cloneUiComponent(child);
                     clonedChild.focusNode = newFocusNode;
                     return clonedChild;
                  }) : [];
               }
               if (addToDatastore) {
                  renderer.addToDataStore(newFocusNode, {path: rdf('type'), type: 'predicate'}, classValue.iri);
               }
            }
            if (addToDatastore) {
               addChildrenToDataStore(renderer, newChildComponents);
            }
            uiComponent.children = [...(uiComponent.children || []), newChildComponents];
         }
         return newFocusNode;
      case shui('EnumSelectEditor'):
         return uiComponent.options && uiComponent.options.length > 0 ? df.fromTerm(uiComponent.options[0].value as any) : df.literal('');
      case shui('InstancesSelectEditor'):
         return uiComponent.instances && uiComponent.instances.length > 0 ? df.fromTerm(uiComponent.instances[0].value as any) : df.namedNode('');
      case shui('IRIEditor'):
         return df.namedNode('');
      case shui('NumberFieldEditor'):
         return df.literal('0', df.namedNode(uiComponent.datatype ?? xsd('decimal')));
      case shui('RichTextEditor'):
         return df.literal('', RDF_('HTML'));
      case shui('SubClassEditor'):
         return uiComponent.subclasses && uiComponent.subclasses.length > 0 ? df.fromTerm(uiComponent.subclasses[0].value as any) : df.namedNode('');
      case shui('TextAreaEditor'):
         return df.literal('');
      case shui('TextAreaWithLangEditor'):
         return df.literal('', 'en');
      case shui('TextFieldEditor'):
         return df.literal('');
      case shui('TextFieldWithLangEditor'):
         return df.literal('', 'en');
      default:
         return df.literal('');
   }
}

function addChildrenToDataStore(renderer: ShaclRenderer, children: UIComponent[]) {
   for (const child of children) {
      if (child.focusNode && child.paths.length > 0 && child.values.length > 0) {
         for (const value of child.values) {
            renderer.addToDataStore(child.focusNode, value.path, value.value);
         }

         // Recursively add grandchildren to the data store
         if (child.children) {
            child.children.forEach(grandChildren => addChildrenToDataStore(renderer, grandChildren));
         }
      }
   }
}

function getDataType(uiComponent: UIComponent, value: UIComponentValue): string | undefined {
   if (value.value.termType === "Literal") {
      return (value.value as Literal).datatype.value;
   }
   return uiComponent.datatype;
}
