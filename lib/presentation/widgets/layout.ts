// Root dispatch for the widget layer: render slots -> components -> the per-widget switch.
import {html, nothing, type TemplateResult} from "lit";
import {twMerge} from "tailwind-merge";
import {type Quad_Object, type Quad_Subject} from "rdf-js";
import {type RootRenderSlot, type TailwindClasses, type UIComponent, type UIComponentValue} from "../../types.ts";
import {shui} from "../../core/namespaces.ts";
import {ShaclRenderer} from "../../shacl-renderer.ts";
import {df, renderDescription, renderOrSelectorForValue, renderLabel, renderPlusIcon, renderXIcon, renderSelectWidgetIcon} from "./shared.ts";
import {renderBlankNodeEditor, renderBooleanEditor, renderDatePickerEditor, renderDateTimePickerEditor, renderIRIEditor, renderNumberFieldEditor, renderTextAreaEditor, renderTextFieldEditor, renderTextFieldWithLangEditor, renderTextAreaWithLangEditor} from "./editors-fields.ts";
import {renderAutoCompleteEditor, renderEnumSelectEditor, renderInstancesSelectEditor, renderSubClassEditor} from "./editors-select.ts";
import {renderDetailsEditor, renderRichTextEditor} from "./editors-rich-nested.ts";

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

export function renderWidget(renderer: ShaclRenderer, uiComponent: UIComponent, value: UIComponentValue, index: number, classes: TailwindClasses, disabled: boolean = false) {
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
