// Field editors: text, textarea (incl. language-tagged variants), number, IRI, blank node,
// boolean, and date / date-time pickers.
import {html, nothing} from "lit";
import {twMerge} from "tailwind-merge";
import {type Literal} from "@rdfjs/types";
import {type TailwindClasses, type UIComponent, type UIComponentValue} from "../../types.ts";
import {xsd} from "../../core/namespaces.ts";
import {findTailwindMarginBottomValue} from "../tailwind.ts";
import {expandPrefixedIRI, mutateTerm} from "../../core/rdf.ts";
import {ShaclRenderer} from "../../shacl-renderer.ts";
import {renderXIcon, getDataType} from "./shared.ts";

export function renderBlankNodeEditor(renderer: ShaclRenderer, uiComponent: UIComponent, value: UIComponentValue, index: number, classes: TailwindClasses, disabled: boolean = false) {
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

export function renderBooleanEditor(renderer: ShaclRenderer, uiComponent: UIComponent, value: UIComponentValue, index: number, classes: TailwindClasses, disabled: boolean = false) {
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

export function renderDatePickerEditor(renderer: ShaclRenderer, uiComponent: UIComponent, value: UIComponentValue, index: number, classes: TailwindClasses, disabled: boolean = false) {
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

export function renderDateTimePickerEditor(renderer: ShaclRenderer, uiComponent: UIComponent, value: UIComponentValue, index: number, classes: TailwindClasses, disabled: boolean = false) {
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

export function renderIRIEditor(renderer: ShaclRenderer, uiComponent: UIComponent, value: UIComponentValue, index: number, classes: TailwindClasses, disabled: boolean = false) {
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

export function renderNumberFieldEditor(renderer: ShaclRenderer, uiComponent: UIComponent, value: UIComponentValue, index: number, classes: TailwindClasses, disabled: boolean = false) {
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

export function renderTextAreaEditor(renderer: ShaclRenderer, uiComponent: UIComponent, value: UIComponentValue, index: number, classes: TailwindClasses, disabled: boolean = false) {
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

export function renderTextFieldEditor(renderer: ShaclRenderer, uiComponent: UIComponent, value: UIComponentValue, index: number, classes: TailwindClasses, disabled: boolean = false) {
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

/**
 * Ordered language options offered by the language dropdown of the WithLang editors: the
 * property shape's sh:languageIn when declared (spec: the dropdown lists these), otherwise the
 * configured/browser preferred languages. The current tag is always included.
 */
export function languageOptions(renderer: ShaclRenderer, uiComponent: UIComponent, current?: string): string[] {
   const base = (uiComponent.languageIn && uiComponent.languageIn.length > 0)
      ? uiComponent.languageIn
      : (renderer.labelConfig.preferredLanguages ?? []);
   return [...new Set(current ? [...base, current] : base)];
}

/** Datalist that turns the free-text language input into a dropdown with free entry. */
function renderLangDatalist(renderer: ShaclRenderer, uiComponent: UIComponent, value: UIComponentValue, index: number) {
   const options = languageOptions(renderer, uiComponent, (value.value as Literal).language || undefined);
   return html`
       <datalist id="${uiComponent.uuid}-${index}-langs">
           ${options.map(lang => html`<option value="${lang}"></option>`)}
       </datalist>
   `;
}

export function renderTextFieldWithLangEditor(renderer: ShaclRenderer, uiComponent: UIComponent, value: UIComponentValue, index: number, classes: TailwindClasses, disabled: boolean = false) {
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
               ${renderLangDatalist(renderer, uiComponent, value, index)}
               <input
                       type="text"
                       ?required="${(uiComponent.minCount ?? 0) > 0}"
                       inputmode="latin"
                       pattern="[a-zA-Z-]*"
                       placeholder="Lang"
                       list="${uiComponent.uuid}-${index}-langs"
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

export function renderTextAreaWithLangEditor(renderer: ShaclRenderer, uiComponent: UIComponent, value: UIComponentValue, index: number, classes: TailwindClasses, disabled: boolean = false) {
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
               ${renderLangDatalist(renderer, uiComponent, value, index)}
               <input
                       type="text"
                       ?required="${(uiComponent.minCount ?? 0) > 0}"
                       inputmode="latin"
                       pattern="[a-zA-Z-]*"
                       placeholder="Lang"
                       list="${uiComponent.uuid}-${index}-langs"
                       .value="${(value.value as Literal).language ?? ''}"
                       ?disabled="${disabled}"
                       class="${twMerge(
                               classes.globalFieldClass,
                               classes.globalInputFieldClass,
                               'w-25 rounded-l-none mb-0 h-full',
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
