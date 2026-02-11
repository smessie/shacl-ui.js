import type {TailwindClasses, UIComponent, UIComponentValue} from "./types.ts";
import {html, nothing} from "lit";
import {twMerge} from 'tailwind-merge';
import {shui, XSD} from "./namespaces.ts";
import * as RDF from "rdf-js";
import {DataFactory} from "rdf-data-factory";
import {findTailwindHeightValue, findTailwindMarginBottomValue} from "./tailwind.ts";
import type {Literal, Term} from "@rdfjs/types";
import {cloneTerm} from "./rdf.ts";

const df: RDF.DataFactory = new DataFactory();

export function renderUIComponent(uiComponent: UIComponent, classes: TailwindClasses, rerender: () => void) {
   return html`
       <div class="mb-4">
           ${renderPlusIcon(uiComponent, classes, rerender)}

           ${renderLabel(uiComponent, classes)}

           ${uiComponent.values.map((value, index) => {
               switch (value.selectedWidget) {
                   case shui("TextFieldEditor"):
                       return renderTextFieldEditor(uiComponent, value, index, classes, rerender);
                   case shui("TextFieldWithLangEditor"):
                       return renderTextFieldWithLangEditor(uiComponent, value, index, classes, rerender);
                   case shui("TextAreaEditor"):
                       return renderTextAreaEditor(uiComponent, value, index, classes, rerender);
                   case shui("NumberFieldEditor"):
                       return renderNumberFieldEditor(uiComponent, value, index, classes, rerender);
                   case shui("BooleanSelectEditor"):
                       return renderBooleanSelectEditor(uiComponent, value, index, classes, rerender);
                   case shui("DatePickerEditor"):
                       return renderDatePickerEditor(uiComponent, value, index, classes, rerender);
                   case shui("DateTimePickerEditor"):
                       return renderDateTimePickerEditor(uiComponent, value, index, classes, rerender);
                   case shui("EnumSelectEditor"):
                       return renderEnumSelectEditor(uiComponent, value, index, classes, rerender);
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
                                   rerender();
                               })}
                           </div>
                       `;
               }
           })}

           ${renderDescription(uiComponent)}
       </div>
   `;
}

function renderDescription(uiComponent: UIComponent) {
   return uiComponent.description ? html`
       <p class="mt-1 text-xs text-gray-500">
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

function renderPlusIcon(uiComponent: UIComponent, classes: TailwindClasses, rerender: () => void) {
   const newValue = getDefaultTermForWidget(uiComponent.defaultWidget, uiComponent.options);

   return uiComponent.maxCount === undefined || uiComponent.values.length < uiComponent.maxCount ? html`
       <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5"
            stroke="currentColor" class="${twMerge(classes.plusIconClass)}" @click="${() => {
           uiComponent.values.push({
               value: newValue,
               widgets: [],
               selectedWidget: uiComponent.defaultWidget,
           });
           rerender();
       }}">
           <path stroke-linecap="round" stroke-linejoin="round"
                 d="M12 9v6m3-3H9m12 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"/>
       </svg>
   ` : nothing;
}

function renderXIcon(uiComponent: UIComponent, classes: TailwindClasses, onClick: () => void) {
   return uiComponent.values.length > (uiComponent.minCount || 0) ? html`
       <div class="absolute inset-y-0 right-0 flex items-center pr-3 h-${findTailwindHeightValue(twMerge(classes.xIconClass)) || '0'}">
           <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5"
                stroke="currentColor" class="${twMerge(classes.xIconClass)}" @click="${onClick}">
               <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/>
           </svg>
       </div>
   ` : nothing;
}

function renderTextFieldEditor(uiComponent: UIComponent, value: UIComponentValue, index: number, classes: TailwindClasses, rerender: () => void) {
   return html`
       <div class="${twMerge('relative', `mb-${findTailwindMarginBottomValue(twMerge(classes.globalFieldClass, classes.globalInputFieldClass, classes.textFieldEditorClass)) || '0'}`)}">
           <input
                   class="${twMerge(classes.globalFieldClass, classes.globalInputFieldClass, classes.textFieldEditorClass, 'mb-0')}"
                   id="${uiComponent.path}"
                   type="text"
                   value="${value.value.value ?? ''}"
                   placeholder="${uiComponent.label}"
                   @change="${(e: Event) => {
                       const input = e.target as HTMLInputElement;
                       value.value.value = input.value;
                   }}"
           />
           ${renderXIcon(uiComponent, classes, () => {
               uiComponent.values.splice(index, 1);
               rerender();
           })}
       </div>
   `;
}

function renderTextFieldWithLangEditor(uiComponent: UIComponent, value: UIComponentValue, index: number, classes: TailwindClasses, rerender: () => void) {
   // Just like a TextFieldEditor, but a grouped input with as second field, a small input for language tag
   return html`
       <div class="${twMerge('flex rounded-md shadow-sm', `mb-${findTailwindMarginBottomValue(twMerge(classes.globalFieldClass, classes.globalInputFieldClass)) || '0'}`)}">
           <!-- Literal value -->
           <input
                   id="${uiComponent.path}"
                   type="text"
                   value="${value.value.value ?? ''}"
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
                       inputmode="latin"
                       pattern="[a-zA-Z-]*"
                       placeholder="Lang"
                       value="${(value.value as Literal).language ?? ''}"
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
                   rerender();
               })}
           </div>
       </div>
   `;
}

function renderTextAreaEditor(uiComponent: UIComponent, value: UIComponentValue, index: number, classes: TailwindClasses, rerender: () => void) {
   return html`
       <div class="${twMerge('relative', `mb-${findTailwindMarginBottomValue(twMerge(classes.globalFieldClass, classes.globalInputFieldClass, classes.textAreaEditorClass)) || '0'}`)}">
           <textarea
                   class="${twMerge(classes.globalFieldClass, classes.globalInputFieldClass, classes.textAreaEditorClass, 'mb-0')}"
                   id="${uiComponent.path}"
                   rows="4"
                   placeholder="${uiComponent.label}"
                   @change="${(e: Event) => {
                       const input = e.target as HTMLInputElement;
                       value.value.value = input.value;
                   }}"
           >${value.value.value ?? ''}</textarea>
           ${renderXIcon(uiComponent, classes, () => {
               uiComponent.values.splice(index, 1);
               rerender();
           })}
       </div>
   `;
}

function renderNumberFieldEditor(uiComponent: UIComponent, value: UIComponentValue, index: number, classes: TailwindClasses, rerender: () => void) {
   return html`
       <div class="${twMerge('relative', `mb-${findTailwindMarginBottomValue(twMerge(classes.globalFieldClass, classes.globalInputFieldClass, classes.numberFieldEditorClass)) || '0'}`)}">
           <input
                   class="${twMerge(classes.globalFieldClass, classes.globalInputFieldClass, classes.numberFieldEditorClass, 'mb-0')}"
                   id="${uiComponent.path}"
                   type="number"
                   step="1"
                   placeholder="${uiComponent.label}"
                   value="${value.value.value ?? ''}"
                   @change="${(e: Event) => {
                       const input = e.target as HTMLInputElement;
                       value.value.value = input.value;
                   }}"
           />
           ${renderXIcon(uiComponent, classes, () => {
               uiComponent.values.splice(index, 1);
               rerender();
           })}
       </div>
   `;
}

function renderBooleanSelectEditor(uiComponent: UIComponent, value: UIComponentValue, index: number, classes: TailwindClasses, rerender: () => void) {
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
               rerender();
           })}
       </div>
   `;
}

function renderDatePickerEditor(uiComponent: UIComponent, value: UIComponentValue, index: number, classes: TailwindClasses, rerender: () => void) {
   return html`
       <div class="${twMerge('relative', `mb-${findTailwindMarginBottomValue(twMerge(classes.globalFieldClass, classes.globalInputFieldClass, classes.datePickerEditorClass)) || '0'}`)}">
           <input
                   class="${twMerge(classes.globalFieldClass, classes.globalInputFieldClass, classes.datePickerEditorClass, 'mb-0')}"
                   id="${uiComponent.path}"
                   type="date"
                   value="${value.value.value ?? ''}"
                   @change="${(e: Event) => {
                       const input = e.target as HTMLInputElement;
                       value.value.value = input.value;
                   }}"
           />
           ${renderXIcon(uiComponent, classes, () => {
               uiComponent.values.splice(index, 1);
               rerender();
           })}
       </div>
   `;
}

function renderDateTimePickerEditor(uiComponent: UIComponent, value: UIComponentValue, index: number, classes: TailwindClasses, rerender: () => void) {
   return html`
       <div class="${twMerge('relative', `mb-${findTailwindMarginBottomValue(twMerge(classes.globalFieldClass, classes.globalInputFieldClass, classes.dateTimePickerEditorClass)) || '0'}`)}">
           <input
                   class="${twMerge(classes.globalFieldClass, classes.globalInputFieldClass, classes.dateTimePickerEditorClass, 'mb-0')}"
                   id="${uiComponent.path}"
                   type="datetime-local"
                   value="${value.value.value ?? ''}"
                   @change="${(e: Event) => {
                       const input = e.target as HTMLInputElement;
                       value.value.value = input.value;
                   }}"
           />
           ${renderXIcon(uiComponent, classes, () => {
               uiComponent.values.splice(index, 1);
               rerender();
           })}
       </div>
   `;
}

function renderEnumSelectEditor(uiComponent: UIComponent, value: UIComponentValue, index: number, classes: TailwindClasses, rerender: () => void) {
   return html`
       <div class="${twMerge('relative', `mb-${findTailwindMarginBottomValue(twMerge(classes.globalFieldClass, classes.globalInputFieldClass, classes.enumSelectEditorClass)) || '0'}`)}">
           <select
                   id="${uiComponent.path}-${index}"
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
               rerender();
           })}
       </div>
   `;
}

export function getDefaultTermForWidget(widget: string | undefined, options?: Term[]): Term {
   switch (widget) {
      case shui('TextFieldEditor'):
         return df.literal('');
      case shui('TextFieldWithLangEditor'):
         return df.literal('', 'en');
      case shui('TextAreaEditor'):
         return df.literal('');
      case shui('NumberFieldEditor'):
         return df.literal('0', XSD('integer'));
      case shui('BooleanSelectEditor'):
         return df.literal('false', XSD('boolean'));
      case shui('DatePickerEditor'):
         return df.literal('', XSD('date'));
      case shui('DateTimePickerEditor'):
         return df.literal('', XSD('dateTime'));
      case shui('EnumSelectEditor'):
         return options && options.length > 0 ? cloneTerm(options[0]) : df.literal('');
      default:
         return df.literal('');
   }
}
