import type {TailwindClasses, UIComponent, UIComponentValue} from "./types.ts";
import {html, nothing, type TemplateResult} from "lit";
import {twMerge} from 'tailwind-merge';
import {shui, XSD} from "./namespaces.ts";
import * as RDF from "rdf-js";
import {DataFactory} from "rdf-data-factory";
import {findTailwindHeightValue, findTailwindMarginBottomValue} from "./tailwind.ts";
import type {Literal, Term} from "@rdfjs/types";
import {cloneTerm} from "./rdf.ts";
import {ShaclRenderer} from "../shacl-renderer.ts";

const df: RDF.DataFactory = new DataFactory();

export function renderUIComponent(renderer: ShaclRenderer, uiComponent: UIComponent, classes: TailwindClasses) {
   if (uiComponent.children) {
      return html`
          <div class="mb-4">
              ${renderPlusIcon(renderer, uiComponent, classes)}

              ${renderLabel(uiComponent, classes)}

              ${uiComponent.children.map((childComponents: UIComponent[], index: number): TemplateResult => {
                  return html`
                      <div class="${twMerge(classes.childComponentClass)}">
                          ${renderXIcon(uiComponent, classes, () => {
                              uiComponent.children!.splice(index, 1);
                              uiComponent.values.splice(index, 1);
                              renderer.rerender();
                          }, false)}

                          ${childComponents.map(childComponent => renderUIComponent(renderer, childComponent, classes))}
                      </div>
                  `;
              })}

              ${renderDescription(uiComponent, classes)}
          </div>
      `;
   }
   return html`
       <div class="mb-4">
           ${renderPlusIcon(renderer, uiComponent, classes)}

           ${renderLabel(uiComponent, classes)}

           ${uiComponent.values.map((value, index) => {
               switch (value.selectedWidget) {
                   case shui("AutoCompleteEditor"):
                       return renderAutoCompleteEditor(renderer, uiComponent, value, index, classes);
                   case shui("BlankNodeEditor"):
                       return renderBlankNodeEditor(renderer, uiComponent, value, index, classes);
                   case shui("BooleanSelectEditor"):
                       return renderBooleanSelectEditor(renderer, uiComponent, value, index, classes);
                   case shui("DatePickerEditor"):
                       return renderDatePickerEditor(renderer, uiComponent, value, index, classes);
                   case shui("DateTimePickerEditor"):
                       return renderDateTimePickerEditor(renderer, uiComponent, value, index, classes);
                   case shui("EnumSelectEditor"):
                       return renderEnumSelectEditor(renderer, uiComponent, value, index, classes);
                   case shui("IRIEditor"):
                       return renderIRIEditor(renderer, uiComponent, value, index, classes);
                   case shui("NumberFieldEditor"):
                       return renderNumberFieldEditor(renderer, uiComponent, value, index, classes);
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
                                   ${uiComponent.label} (${uiComponent.path}) - Unsupported widget:
                                   ${value.selectedWidget ?? 'none'}
                               </label>
                               ${renderXIcon(uiComponent, {
                                   ...classes,
                                   xIconClass: twMerge(classes.xIconClass, 'mt-0')
                               }, () => {
                                   uiComponent.values.splice(index, 1);
                                   renderer.rerender();
                               })}
                           </div>
                       `;
               }
           })}

           ${renderDescription(uiComponent, classes)}
       </div>
   `;
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
       <label class="${twMerge(classes.labelClass)}"
              for="${uiComponent.path}">
           ${uiComponent.label}
       </label>
   `;
}

function renderPlusIcon(renderer: ShaclRenderer, uiComponent: UIComponent, classes: TailwindClasses) {
   let onClick: () => void;
   if (uiComponent.node) {
      // A new children component must be added on click.
      onClick = () => {
         const newFocusNode = df.namedNode(`urn:uuid:${crypto.randomUUID()}`);
         const newChildComponents: UIComponent[] = (uiComponent.defaultChild ?? []).map(child => {
            const clonedChild = structuredClone(child);
            clonedChild.focusNode = newFocusNode;
            return clonedChild;
         });
         uiComponent.children = [...(uiComponent.children || []), newChildComponents];
         uiComponent.values.push({
            value: newFocusNode,
         });
         renderer.rerender();
      }
   } else {
      onClick = () => {
         uiComponent.values.push({
            value: getDefaultTermForWidget(uiComponent.defaultWidget, uiComponent.options),
            widgets: [],
            selectedWidget: uiComponent.defaultWidget,
         });
         renderer.rerender();
      }
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

function renderAutoCompleteEditor(
   renderer: ShaclRenderer,
   uiComponent: UIComponent,
   value: UIComponentValue,
   index: number,
   classes: TailwindClasses,
) {
   const key = `${uiComponent.path}-${index}`;

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
                       value.value.value = '';
                   }}"
                   @blur="${() => {
                       setTimeout(() => {
                           renderer.setAutoCompleteEditorOpen(key, false);
                           renderer.setAutoCompleteEditorFilter(key, '');
                       }, 150);
                   }}"
           />
           ${renderXIcon(uiComponent, classes, () => {
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
                                   value.value.value = instance.value.value;
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
               uiComponent.values.splice(index, 1);
               renderer.rerender();
           })}
       </div>
   `;
}

function renderBooleanSelectEditor(renderer: ShaclRenderer, uiComponent: UIComponent, value: UIComponentValue, index: number, classes: TailwindClasses) {
   return html`
       <div class="${twMerge('relative', `mb-${findTailwindMarginBottomValue(twMerge(classes.labelClass, classes.booleanSelectEditorLabelClass)) || '0'}`)}">
           <label class="${twMerge(classes.labelClass, classes.booleanSelectEditorLabelClass)}"
                  for="${uiComponent.path}-${index}">
               <input
                       class="${twMerge(classes.globalFieldClass, classes.booleanSelectEditorClass, 'mb-0')}"
                       id="${uiComponent.path}-${index}"
                       type="checkbox"
                       ?checked="${value.value.value === "true"}"
                       @change="${(e: Event) => {
                           const input = e.target as HTMLInputElement;
                           value.value.value = input.checked ? "true" : "false";
                       }}"
               />
               ${uiComponent.label}
           </label>
           ${renderXIcon(uiComponent, {...classes, xIconClass: twMerge(classes.xIconClass, 'mt-0')}, () => {
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
                   id="${uiComponent.path}"
                   required
                   type="date"
                   .value="${value.value.value ?? ''}"
                   @change="${(e: Event) => {
                       const input = e.target as HTMLInputElement;
                       value.value.value = input.value;
                   }}"
           />
           ${renderXIcon(uiComponent, classes, () => {
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
                   id="${uiComponent.path}"
                   required
                   type="datetime-local"
                   .value="${value.value.value ?? ''}"
                   @change="${(e: Event) => {
                       const input = e.target as HTMLInputElement;
                       value.value.value = input.value;
                   }}"
           />
           ${renderXIcon(uiComponent, classes, () => {
               uiComponent.values.splice(index, 1);
               renderer.rerender();
           })}
       </div>
   `;
}

function renderEnumSelectEditor(renderer: ShaclRenderer, uiComponent: UIComponent, value: UIComponentValue, index: number, classes: TailwindClasses) {
   return html`
       <div class="${twMerge('relative', `mb-${findTailwindMarginBottomValue(twMerge(classes.globalFieldClass, classes.globalInputFieldClass, classes.enumSelectEditorClass)) || '0'}`)}">
           <select
                   id="${uiComponent.path}-${index}"
                   required
                   class="${twMerge(
                           classes.globalFieldClass,
                           classes.globalInputFieldClass,
                           classes.enumSelectEditorClass,
                           'appearance-none pr-10 mb-0'
                   )}"
                   @change="${(e: Event) => {
                       const input = e.target as HTMLInputElement;
                       value.value.value = input.value;
                   }}"
           >
               ${uiComponent.options?.map(option => html`
                   <option
                           value="${option.value}"
                           ?selected="${value.value?.equals(option)}"
                   >
                       ${option.value}
                   </option>
               `)}
           </select>

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
               uiComponent.values.splice(index, 1);
               renderer.rerender();
           })}
       </div>
   `;
}

function renderIRIEditor(renderer: ShaclRenderer, uiComponent: UIComponent, value: UIComponentValue, index: number, classes: TailwindClasses) {
   return html`
       <div class="${twMerge('relative', `mb-${findTailwindMarginBottomValue(twMerge(classes.globalFieldClass, classes.globalInputFieldClass, classes.iriEditorClass)) || '0'}`)}">
           <input
                   class="${twMerge(classes.globalFieldClass, classes.globalInputFieldClass, classes.iriEditorClass, 'mb-0')}"
                   id="${uiComponent.path}"
                   required
                   type="url"
                   .value="${value.value.value ?? ''}"
                   placeholder="${uiComponent.label}"
                   @change="${(e: Event) => {
                       const input = e.target as HTMLInputElement;
                       value.value.value = input.value;
                   }}"
           />
           ${renderXIcon(uiComponent, classes, () => {
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
                   id="${uiComponent.path}"
                   required
                   type="number"
                   step="1"
                   placeholder="${uiComponent.label}"
                   .value="${value.value.value ?? ''}"
                   @change="${(e: Event) => {
                       const input = e.target as HTMLInputElement;
                       value.value.value = input.value;
                   }}"
           />
           ${renderXIcon(uiComponent, classes, () => {
               uiComponent.values.splice(index, 1);
               renderer.rerender();
           })}
       </div>
   `;
}

function renderTextAreaEditor(renderer: ShaclRenderer, uiComponent: UIComponent, value: UIComponentValue, index: number, classes: TailwindClasses) {
   return html`
       <div class="${twMerge('relative', `mb-${findTailwindMarginBottomValue(twMerge(classes.globalFieldClass, classes.globalInputFieldClass, classes.textAreaEditorClass)) || '0'}`)}">
           <textarea
                   class="${twMerge(classes.globalFieldClass, classes.globalInputFieldClass, classes.textAreaEditorClass, 'mb-0')}"
                   id="${uiComponent.path}"
                   required
                   rows="4"
                   placeholder="${uiComponent.label}"
                   @change="${(e: Event) => {
                       const input = e.target as HTMLInputElement;
                       value.value.value = input.value;
                   }}"
           >${value.value.value ?? ''}</textarea>
           ${renderXIcon(uiComponent, classes, () => {
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
                   id="${uiComponent.path}"
                   type="text"
                   required
                   .value="${value.value.value ?? ''}"
                   placeholder="${uiComponent.label}"
                   @change="${(e: Event) => {
                       const input = e.target as HTMLInputElement;
                       value.value.value = input.value;
                   }}"
           />
           ${renderXIcon(uiComponent, classes, () => {
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
                   id="${uiComponent.path}"
                   type="text"
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
                       value.value.value = input.value;
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
                           (value.value as Literal).language = input.value;
                       }}"
               />

               ${renderXIcon(uiComponent, classes, () => {
                   uiComponent.values.splice(index, 1);
                   renderer.rerender();
               })}
           </div>
       </div>
   `;
}

function renderTextAreaWithLangEditor(
   renderer: ShaclRenderer,
   uiComponent: UIComponent,
   value: UIComponentValue,
   index: number,
   classes: TailwindClasses
) {
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
                   id="${uiComponent.path}"
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
                       value.value.value = input.value;
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
                           (value.value as Literal).language = input.value;
                       }}"
               />

               ${renderXIcon(uiComponent, classes, () => {
                   uiComponent.values.splice(index, 1);
                   renderer.rerender();
               })}
           </div>
       </div>
   `;
}

export function getDefaultTermForWidget(widget: string | undefined, options?: Term[]): Term {
   switch (widget) {
      case shui('AutoCompleteEditor'):
         return df.namedNode('');
      case shui('BlankNodeEditor'):
         return df.blankNode();
      case shui('BooleanSelectEditor'):
         return df.literal('false', XSD('boolean'));
      case shui('DatePickerEditor'):
         return df.literal('', XSD('date'));
      case shui('DateTimePickerEditor'):
         return df.literal('', XSD('dateTime'));
      case shui('EnumSelectEditor'):
         return options && options.length > 0 ? cloneTerm(options[0]) : df.literal('');
      case shui('IRIEditor'):
         return df.namedNode('');
      case shui('NumberFieldEditor'):
         return df.literal('0', XSD('integer'));
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
