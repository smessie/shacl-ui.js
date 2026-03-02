import type {Path, TailwindClasses, UIComponent, UIComponentValue} from "./types.ts";
import {html, nothing, type TemplateResult} from "lit";
import {twMerge} from 'tailwind-merge';
import {rdf, shui, xsd, XSD} from "./namespaces.ts";
import type {Quad_Object, Quad_Subject} from "rdf-js";
import * as RDF from "rdf-js";
import {DataFactory} from "rdf-data-factory";
import {findTailwindHeightValue, findTailwindMarginBottomValue} from "./tailwind.ts";
import type {Literal, Term} from "@rdfjs/types";
import {mutateTerm} from "./rdf.ts";
import {ShaclRenderer} from "../shacl-renderer.ts";

const df: RDF.DataFactory = new DataFactory();

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
               return html`

                   <div class="flex items-start gap-2">
                       <div class="flex-1 min-w-0">
                           ${renderWidget(renderer, uiComponent, value, index, classes)}
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

function renderWidget(renderer: ShaclRenderer, uiComponent: UIComponent, value: UIComponentValue, index: number, classes: TailwindClasses) {
   switch (value.selectedWidget) {
      case shui("AutoCompleteEditor"):
         return renderAutoCompleteEditor(renderer, uiComponent, value, index, classes);
      case shui("BlankNodeEditor"):
         return renderBlankNodeEditor(renderer, uiComponent, value, index, classes);
      case shui("BooleanEditor"):
         return renderBooleanEditor(renderer, uiComponent, value, index, classes);
      case shui("DatePickerEditor"):
         return renderDatePickerEditor(renderer, uiComponent, value, index, classes);
      case shui("DateTimePickerEditor"):
         return renderDateTimePickerEditor(renderer, uiComponent, value, index, classes);
      case shui("DetailsEditor"):
         return renderDetailsEditor(renderer, uiComponent, value, index, classes);
      case shui("EnumSelectEditor"):
         return renderEnumSelectEditor(renderer, uiComponent, value, index, classes);
      case shui("IRIEditor"):
         return renderIRIEditor(renderer, uiComponent, value, index, classes);
      case shui("NumberFieldEditor"):
         return renderNumberFieldEditor(renderer, uiComponent, value, index, classes);
      case shui("SubClassEditor"):
         return renderSubClassEditor(renderer, uiComponent, value, index, classes);
      case shui("TextAreaEditor"):
         return renderTextAreaEditor(renderer, uiComponent, value, index, classes);
      case shui("TextAreaWithLangEditor"):
         return renderTextAreaWithLangEditor(renderer, uiComponent, value, index, classes);
      case shui("TextFieldEditor"):
         return renderTextFieldEditor(renderer, uiComponent, value, index, classes);
      case shui("TextFieldWithLangEditor"):
         return renderTextFieldWithLangEditor(renderer, uiComponent, value, index, classes);
      default:
         return html`
             <div class="relative">
                 <label class="block text-gray-700 text-sm font-bold mb-2">
                     ${uiComponent.label} (${value.path.path}) - Unsupported widget:
                     ${value.selectedWidget ?? 'none'}
                 </label>
                 ${renderXIcon(uiComponent, {
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

function renderLabel(uiComponent: UIComponent, classes: TailwindClasses) {
   return html`
       <label class="${twMerge(classes.labelClass)}">
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
         widgets: uiComponent.defaultWidgets,
         selectedWidget: uiComponent.defaultWidget,
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

function renderAutoCompleteEditor(renderer: ShaclRenderer, uiComponent: UIComponent, value: UIComponentValue, index: number, classes: TailwindClasses,) {
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
                           'mb-0'
                   )}"
                   autocomplete="off"
                   .value="${displayText}"
                   placeholder="${uiComponent.label}"
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
           ${renderXIcon(uiComponent, classes, () => {
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

function renderBlankNodeEditor(renderer: ShaclRenderer, uiComponent: UIComponent, value: UIComponentValue, index: number, classes: TailwindClasses) {
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
           ${renderXIcon(uiComponent, classes, () => {
               renderer.removeFromDataStore(uiComponent.focusNode, value.path, value.value, uiComponent.children?.[index]);
               uiComponent.values.splice(index, 1);
               renderer.rerender();
           })}
       </div>
   `;
}

function renderBooleanEditor(renderer: ShaclRenderer, uiComponent: UIComponent, value: UIComponentValue, index: number, classes: TailwindClasses) {
   return html`
       <div class="${twMerge('relative', `mb-${findTailwindMarginBottomValue(twMerge(classes.labelClass, classes.booleanEditorLabelClass)) || '0'}`)}">
           <label class="${twMerge(classes.labelClass, classes.booleanEditorLabelClass)}"
                  for="${value.path.path}-${index}">
               <input
                       class="${twMerge(classes.globalFieldClass, classes.booleanEditorClass, 'mb-0')}"
                       id="${value.path.path}-${index}"
                       type="checkbox"
                       ?checked="${value.value.value === "true"}"
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
           ${renderXIcon(uiComponent, {...classes, xIconClass: twMerge(classes.xIconClass, 'mt-0')}, () => {
               renderer.removeFromDataStore(uiComponent.focusNode, value.path, value.value, uiComponent.children?.[index]);
               uiComponent.values.splice(index, 1);
               renderer.rerender();
           })}
       </div>
   `;
}

function renderDatePickerEditor(renderer: ShaclRenderer, uiComponent: UIComponent, value: UIComponentValue, index: number, classes: TailwindClasses) {
   return html`
       <div class="${twMerge('relative', `mb-${findTailwindMarginBottomValue(twMerge(classes.globalFieldClass, classes.globalInputFieldClass, classes.datePickerEditorClass)) || '0'}`)}">
           <input
                   class="${twMerge(classes.globalFieldClass, classes.globalInputFieldClass, classes.datePickerEditorClass, 'mb-0')}"
                   id="${value.path.path}"
                   required
                   type="date"
                   min="${uiComponent.minInclusive ?? nothing}"
                   max="${uiComponent.maxInclusive ?? nothing}"
                   .value="${value.value.value ?? ''}"
                   @change="${(e: Event) => {
                       const input = e.target as HTMLInputElement;
                       const newTerm = mutateTerm(value.value, input.value);
                       renderer.removeFromDataStore(uiComponent.focusNode, value.path, value.value);
                       renderer.addToDataStore(uiComponent.focusNode, value.path, newTerm);
                       value.value = newTerm;
                   }}"
           />
           ${renderXIcon(uiComponent, classes, () => {
               renderer.removeFromDataStore(uiComponent.focusNode, value.path, value.value, uiComponent.children?.[index]);
               uiComponent.values.splice(index, 1);
               renderer.rerender();
           })}
       </div>
   `;
}

function renderDateTimePickerEditor(renderer: ShaclRenderer, uiComponent: UIComponent, value: UIComponentValue, index: number, classes: TailwindClasses) {
   return html`
       <div class="${twMerge('relative', `mb-${findTailwindMarginBottomValue(twMerge(classes.globalFieldClass, classes.globalInputFieldClass, classes.dateTimePickerEditorClass)) || '0'}`)}">
           <input
                   class="${twMerge(classes.globalFieldClass, classes.globalInputFieldClass, classes.dateTimePickerEditorClass, 'mb-0')}"
                   id="${value.path.path}"
                   required
                   type="datetime-local"
                   min="${uiComponent.minInclusive ?? nothing}"
                   max="${uiComponent.maxInclusive ?? nothing}"
                   .value="${value.value.value ?? ''}"
                   @change="${(e: Event) => {
                       const input = e.target as HTMLInputElement;
                       const newTerm = mutateTerm(value.value, input.value);
                       renderer.removeFromDataStore(uiComponent.focusNode, value.path, value.value);
                       renderer.addToDataStore(uiComponent.focusNode, value.path, newTerm);
                       value.value = newTerm;
                   }}"
           />
           ${renderXIcon(uiComponent, classes, () => {
               renderer.removeFromDataStore(uiComponent.focusNode, value.path, value.value, uiComponent.children?.[index]);
               uiComponent.values.splice(index, 1);
               renderer.rerender();
           })}
       </div>
   `;
}

function renderDetailsEditor(renderer: ShaclRenderer, uiComponent: UIComponent, value: UIComponentValue, index: number, classes: TailwindClasses) {
   const childComponents = uiComponent.children ? uiComponent.children[index] : [];
   return html`
       <div class="${twMerge(classes.detailsEditorClass)}">
           ${renderXIcon(uiComponent, classes, () => {
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
   const storedKey = uiComponent.class?.value;
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
                       const newTerm = mutateTerm(uiComponent.class ?? df.namedNode(''), '');
                       const path: Path = {path: rdf('type'), type: 'predicate'};
                       renderer.removeFromDataStore(value.value, path, uiComponent.class);
                       renderer.addToDataStore(value.value, path, newTerm);
                       uiComponent.class = newTerm;
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
                                   const newTerm = mutateTerm(uiComponent.class ?? df.namedNode(''), c.value.value.value);
                                   const path: Path = {path: rdf('type'), type: 'predicate'};
                                   renderer.removeFromDataStore(value.value, path, uiComponent.class);
                                   renderer.addToDataStore(value.value, path, newTerm);
                                   uiComponent.class = newTerm;

                                   // Update the children of the details editor to match the selected class.
                                   const classValue = uiComponent.classes?.find(cv => cv.value.value.value === c.value.value.value);
                                   if (classValue) {
                                       const newChildren = structuredClone(classValue.children ?? []);
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

function renderEnumSelectEditor(renderer: ShaclRenderer, uiComponent: UIComponent, value: UIComponentValue, index: number, classes: TailwindClasses) {
   const key = `${uiComponent.uuid}-${uiComponent.focusNode?.value}-${value.path.path}-${index}`;

   const open = renderer.enumSelectEditorOpen[key] ?? false;

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
                   id="${value.path.path}-${index}"
                   class="${twMerge(
                           classes.globalFieldClass,
                           classes.globalInputFieldClass,
                           classes.enumSelectEditorClass,
                           'appearance-none pr-10 mb-0 cursor-pointer flex items-center'
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

           ${renderXIcon(uiComponent, classes, () => {
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

function renderIRIEditor(renderer: ShaclRenderer, uiComponent: UIComponent, value: UIComponentValue, index: number, classes: TailwindClasses) {
   return html`
       <div class="${twMerge('relative', `mb-${findTailwindMarginBottomValue(twMerge(classes.globalFieldClass, classes.globalInputFieldClass, classes.iriEditorClass)) || '0'}`)}">
           <input
                   class="${twMerge(classes.globalFieldClass, classes.globalInputFieldClass, classes.iriEditorClass, 'mb-0')}"
                   id="${value.path.path}"
                   required
                   type="url"
                   pattern="${uiComponent.pattern ?? nothing}"
                   .value="${value.value.value ?? ''}"
                   placeholder="${uiComponent.label}"
                   @change="${(e: Event) => {
                       const input = e.target as HTMLInputElement;
                       const newTerm = mutateTerm(value.value, input.value);
                       renderer.removeFromDataStore(uiComponent.focusNode, value.path, value.value);
                       renderer.addToDataStore(uiComponent.focusNode, value.path, newTerm);
                       value.value = newTerm;
                   }}"
           />
           ${renderXIcon(uiComponent, classes, () => {
               renderer.removeFromDataStore(uiComponent.focusNode, value.path, value.value, uiComponent.children?.[index]);
               uiComponent.values.splice(index, 1);
               renderer.rerender();
           })}
       </div>
   `;
}

function renderNumberFieldEditor(renderer: ShaclRenderer, uiComponent: UIComponent, value: UIComponentValue, index: number, classes: TailwindClasses) {
   return html`
       <div class="${twMerge('relative', `mb-${findTailwindMarginBottomValue(twMerge(classes.globalFieldClass, classes.globalInputFieldClass, classes.numberFieldEditorClass)) || '0'}`)}">
           <input
                   class="${twMerge(classes.globalFieldClass, classes.globalInputFieldClass, classes.numberFieldEditorClass, 'mb-0')}"
                   id="${value.path.path}"
                   required
                   type="number"
                   step="${getDataType(uiComponent, value) === xsd('integer') ? '1' : 'any'}"
                   inputmode="${getDataType(uiComponent, value) === xsd('integer') ? 'numeric' : 'decimal'}"
                   min="${uiComponent.minInclusive ?? nothing}"
                   max="${uiComponent.maxInclusive ?? nothing}"
                   placeholder="${uiComponent.label}"
                   .value="${value.value.value ?? ''}"
                   @change="${(e: Event) => {
                       const input = e.target as HTMLInputElement;
                       const newTerm = mutateTerm(value.value, input.value);
                       renderer.removeFromDataStore(uiComponent.focusNode, value.path, value.value);
                       renderer.addToDataStore(uiComponent.focusNode, value.path, newTerm);
                       value.value = newTerm;
                   }}"
           />
           ${renderXIcon(uiComponent, classes, () => {
               renderer.removeFromDataStore(uiComponent.focusNode, value.path, value.value, uiComponent.children?.[index]);
               uiComponent.values.splice(index, 1);
               renderer.rerender();
           })}
       </div>
   `;
}

function renderSubClassEditor(renderer: ShaclRenderer, uiComponent: UIComponent, value: UIComponentValue, index: number, classes: TailwindClasses) {
   const key = `${uiComponent.uuid}-${uiComponent.focusNode?.value}-${value.path.path}-${index}`;

   const open = renderer.subClassEditorOpen[key] ?? false;
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
                           'mb-0'
                   )}"
                   autocomplete="off"
                   .value="${displayText}"
                   placeholder="${uiComponent.label}"
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
           ${renderXIcon(uiComponent, classes, () => {
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

function renderTextAreaEditor(renderer: ShaclRenderer, uiComponent: UIComponent, value: UIComponentValue, index: number, classes: TailwindClasses) {
   return html`
       <div class="${twMerge('relative', `mb-${findTailwindMarginBottomValue(twMerge(classes.globalFieldClass, classes.globalInputFieldClass, classes.textAreaEditorClass)) || '0'}`)}">
           <textarea
                   class="${twMerge(classes.globalFieldClass, classes.globalInputFieldClass, classes.textAreaEditorClass, 'mb-0')}"
                   id="${value.path.path}"
                   required
                   rows="4"
                   placeholder="${uiComponent.label}"
                   @change="${(e: Event) => {
                       const input = e.target as HTMLInputElement;
                       const newTerm = mutateTerm(value.value, input.value);
                       renderer.removeFromDataStore(uiComponent.focusNode, value.path, value.value);
                       renderer.addToDataStore(uiComponent.focusNode, value.path, newTerm);
                       value.value = newTerm;
                   }}"
           >${value.value.value ?? ''}</textarea>
           ${renderXIcon(uiComponent, classes, () => {
               renderer.removeFromDataStore(uiComponent.focusNode, value.path, value.value, uiComponent.children?.[index]);
               uiComponent.values.splice(index, 1);
               renderer.rerender();
           })}
       </div>
   `;
}

function renderTextFieldEditor(renderer: ShaclRenderer, uiComponent: UIComponent, value: UIComponentValue, index: number, classes: TailwindClasses) {
   return html`
       <div class="${twMerge('relative', `mb-${findTailwindMarginBottomValue(twMerge(classes.globalFieldClass, classes.globalInputFieldClass, classes.textFieldEditorClass)) || '0'}`)}">
           <input
                   class="${twMerge(classes.globalFieldClass, classes.globalInputFieldClass, classes.textFieldEditorClass, 'mb-0')}"
                   id="${value.path.path}"
                   type="text"
                   pattern="${uiComponent.pattern ?? nothing}"
                   required
                   .value="${value.value.value ?? ''}"
                   placeholder="${uiComponent.label}"
                   @change="${(e: Event) => {
                       const input = e.target as HTMLInputElement;
                       const newTerm = mutateTerm(value.value, input.value);
                       renderer.removeFromDataStore(uiComponent.focusNode, value.path, value.value);
                       renderer.addToDataStore(uiComponent.focusNode, value.path, newTerm);
                       value.value = newTerm;
                   }}"
           />
           ${renderXIcon(uiComponent, classes, () => {
               renderer.removeFromDataStore(uiComponent.focusNode, value.path, value.value, uiComponent.children?.[index]);
               uiComponent.values.splice(index, 1);
               renderer.rerender();
           })}
       </div>
   `;
}

function renderTextFieldWithLangEditor(renderer: ShaclRenderer, uiComponent: UIComponent, value: UIComponentValue, index: number, classes: TailwindClasses) {
   // Just like a TextFieldEditor, but a grouped input with as second field, a small input for language tag
   return html`
       <div class="${twMerge('flex rounded-md shadow-sm', `mb-${findTailwindMarginBottomValue(twMerge(classes.globalFieldClass, classes.globalInputFieldClass)) || '0'}`)}">
           <!-- Literal value -->
           <input
                   id="${value.path.path}"
                   type="text"
                   pattern="${uiComponent.pattern ?? nothing}"
                   required
                   .value="${value.value.value ?? ''}"
                   placeholder="${uiComponent.label}"
                   class="${twMerge(
                           classes.globalFieldClass,
                           classes.globalInputFieldClass,
                           classes.textFieldEditorClass,
                           'rounded-r-none pr-3 mb-0'
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
                       required
                       inputmode="latin"
                       pattern="[a-zA-Z-]*"
                       placeholder="Lang"
                       .value="${(value.value as Literal).language ?? ''}"
                       class="${twMerge(
                               classes.globalFieldClass,
                               classes.globalInputFieldClass,
                               'w-25 rounded-l-none mb-0'
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

               ${renderXIcon(uiComponent, classes, () => {
                   renderer.removeFromDataStore(uiComponent.focusNode, value.path, value.value, uiComponent.children?.[index]);
                   uiComponent.values.splice(index, 1);
                   renderer.rerender();
               })}
           </div>
       </div>
   `;
}

function renderTextAreaWithLangEditor(renderer: ShaclRenderer, uiComponent: UIComponent, value: UIComponentValue, index: number, classes: TailwindClasses) {
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
                   id="${value.path.path}"
                   required
                   rows="4"
                   placeholder="${uiComponent.label}"
                   class="${twMerge(
                           classes.globalFieldClass,
                           classes.globalInputFieldClass,
                           classes.textAreaEditorClass,
                           'rounded-r-none pr-3 mb-0 resize-y'
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
                       required
                       inputmode="latin"
                       pattern="[a-zA-Z-]*"
                       placeholder="Lang"
                       .value="${(value.value as Literal).language ?? ''}"
                       class="${twMerge(
                               classes.globalFieldClass,
                               classes.globalInputFieldClass,
                               'w-25 rounded-l-none mb-0 h-full'
                       )}"
                       @change="${(e: Event) => {
                           const input = e.target as HTMLInputElement;
                           const newTerm = mutateTerm(value.value, undefined, input.value);
                           renderer.removeFromDataStore(uiComponent.focusNode, value.path, value.value);
                           renderer.addToDataStore(uiComponent.focusNode, value.path, newTerm);
                           value.value = newTerm;
                       }}"
               />

               ${renderXIcon(uiComponent, classes, () => {
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
         const newFocusNode = df.namedNode(`urn:uuid:${crypto.randomUUID()}`);
         if (uiComponent.children != undefined && addChildren) {
            // If defaultChild is set on the uiComponent, use it as default children for the details editor
            // Otherwise, if class and classes are set on the uiComponent, find the classValue that matches the class and use its children as default children for the details editor
            let newChildComponents: UIComponent[] = []
            if (uiComponent.defaultChild) {
               newChildComponents = uiComponent.defaultChild.map(child => {
                  const clonedChild = structuredClone(child);
                  clonedChild.focusNode = newFocusNode;
                  return clonedChild;
               });
            } else if (uiComponent.class && uiComponent.classes) {
               const classValue = uiComponent.classes.find(cv => cv.value.value.value === uiComponent.class?.value);
               if (classValue) {
                  newChildComponents = classValue.children ? classValue.children.map(child => {
                     const clonedChild = structuredClone(child);
                     clonedChild.focusNode = newFocusNode;
                     return clonedChild;
                  }) : [];
               }
               if (addToDatastore) {
                  renderer.addToDataStore(newFocusNode, {path: rdf('type'), type: 'predicate'}, uiComponent.class);
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
      case shui('IRIEditor'):
         return df.namedNode('');
      case shui('NumberFieldEditor'):
         return df.literal('0', df.namedNode(uiComponent.datatype ?? xsd('decimal')));
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
