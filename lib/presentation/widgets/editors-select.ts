// Selection editors: autocomplete, enum select, instances select, subclass select, and the
// details class selector.
import {html, nothing} from "lit";
import {twMerge} from "tailwind-merge";
import {type Path, type TailwindClasses, type UIComponent, type UIComponentValue} from "../../types.ts";
import {rdf} from "../../core/namespaces.ts";
import {findTailwindMarginBottomValue} from "../tailwind.ts";
import {mutateTerm} from "../../core/rdf.ts";
import {cloneUiComponent} from "../../core/clone.ts";
import {ShaclRenderer} from "../../shacl-renderer.ts";
import {df, renderXIcon} from "./shared.ts";

export function renderAutoCompleteEditor(renderer: ShaclRenderer, uiComponent: UIComponent, value: UIComponentValue, index: number, classes: TailwindClasses, disabled: boolean = false) {
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

export function renderDetailsClassSelect(renderer: ShaclRenderer, uiComponent: UIComponent, value: UIComponentValue, index: number, classes: TailwindClasses) {
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
                                       // Only clear this row's children; other value rows keep theirs.
                                       if (!uiComponent.children) uiComponent.children = [];
                                       uiComponent.children[index] = [];
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

export function renderEnumSelectEditor(renderer: ShaclRenderer, uiComponent: UIComponent, value: UIComponentValue, index: number, classes: TailwindClasses, disabled: boolean = false) {
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

export function renderInstancesSelectEditor(renderer: ShaclRenderer, uiComponent: UIComponent, value: UIComponentValue, index: number, classes: TailwindClasses, disabled: boolean = false) {
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

export function renderSubClassEditor(renderer: ShaclRenderer, uiComponent: UIComponent, value: UIComponentValue, index: number, classes: TailwindClasses, disabled: boolean = false) {
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
