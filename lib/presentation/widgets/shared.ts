// Shared widget-rendering helpers: field label/description, +/x icons, the widget-type
// selector, sh:or value selector, default-value construction, and the shared data factory.
import * as RDF from "@rdfjs/types";
import {type Literal, type Term} from "@rdfjs/types";
import {DataFactory} from "rdf-data-factory";
import DOMPurify from 'dompurify';
import {html, nothing} from "lit";
import {until} from "lit/directives/until.js";
import {twMerge} from "tailwind-merge";
import {type RdfStore} from "rdf-stores";
import {type LabeledValue, type TailwindClasses, type UIComponent, type UIComponentValue} from "../../types.ts";
import {rdf, RDF as RDF_, SH, shui, XSD, xsd} from "../../core/namespaces.ts";
import {findTailwindHeightValue} from "../tailwind.ts";
import {toLabeledValue} from "../../core/labels.ts";
import {cloneUiComponent} from "../../core/clone.ts";
import {ShaclRenderer} from "../../shacl-renderer.ts";

export const df: RDF.DataFactory = new DataFactory();

/** Sanitize an HTML string before it is bound into the DOM or stored as an rdf:HTML literal. */
export function sanitizeHtml(value: string): string {
   return DOMPurify.sanitize(value);
}

/**
 * Reads the language of an rdf:HTML literal's content from the `lang` attribute of its single
 * root element (the spec stores the RichTextEditor language there). Returns undefined for
 * fragments without a single root element or without a lang attribute.
 */
export function getHtmlLang(html: string): string | undefined {
   const template = document.createElement('template');
   template.innerHTML = html;
   const children = template.content.children;
   if (children.length === 1) {
      return children[0].getAttribute('lang') || undefined;
   }
   return undefined;
}

/**
 * Sets (or removes, when `lang` is undefined) the language of an rdf:HTML fragment on its root
 * element's `lang` attribute. A fragment without a single root element is wrapped in a
 * `<div lang="...">` so the attribute has a place to live.
 */
export function setHtmlLang(html: string, lang: string | undefined): string {
   const template = document.createElement('template');
   template.innerHTML = html;
   const content = template.content;
   if (content.children.length === 1 && content.childNodes.length === 1) {
      if (lang) content.children[0].setAttribute('lang', lang);
      else content.children[0].removeAttribute('lang');
      return template.innerHTML;
   }
   if (!lang) return html;
   const wrapper = document.createElement('div');
   wrapper.setAttribute('lang', lang);
   wrapper.append(...content.childNodes);
   return wrapper.outerHTML;
}

/** Allow only http(s)/mailto links, blocking javascript:/data: schemes from sh:or rich-text links. */
export function isSafeLinkUrl(url: string): boolean {
   try {
      return ['http:', 'https:', 'mailto:'].includes(new URL(url, window.location.href).protocol);
   } catch {
      return false;
   }
}

export function renderDescription(uiComponent: UIComponent, classes: TailwindClasses) {
   return uiComponent.description ? html`
       <p class="${twMerge(classes.descriptionClass)}">
           ${uiComponent.description}
       </p>
   ` : nothing;
}

/**
 * Returns a human-readable label for an or-option at the given index.
 */
export async function getOrOptionLabel(renderer: ShaclRenderer, uiComponent: UIComponent, index: number, dataGraph: RdfStore, shapesGraph: RdfStore): Promise<LabeledValue> {
   const {orNode, orDatatype, orClass} = uiComponent;
   if (orNode) {
      const labeledValue = await toLabeledValue(orNode[index]?.node, dataGraph, shapesGraph, renderer.labelConfig);
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
export function renderOrSelectorForValue(renderer: ShaclRenderer, uiComponent: UIComponent, value: UIComponentValue, valueIndex: number, classes: TailwindClasses) {
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
               <span>${until(getOrOptionLabel(renderer, uiComponent, selectedIndex, renderer.dataStore!, renderer.shapesStore!).then(res => res.label))}</span>
               <svg class="w-3 h-3 opacity-60"
                    xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"
                    stroke="currentColor" stroke-width="2.5">
                   <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7"/>
               </svg>
           </div>

           ${open ? html`
               <ul class="${twMerge(classes.orSelectorDropdownClass, 'absolute z-50 w-full mt-1')}">
                   ${indices.map(index => {
                      const labeledValue = getOrOptionLabel(renderer, uiComponent, index, renderer.dataStore!, renderer.shapesStore!);
                      return html`
                          <li class="${twMerge(
                                  classes.orSelectorOptionClass,
                                  index === selectedIndex ? classes.orSelectorOptionSelectedClass : ''
                          )}"
                              @mousedown="${() => {
                                  renderer.setOrSelectOpen(key, false);
                                  // Purge the previously-selected option's data and materialize the
                                  // newly-selected option's defaults so only the current selection's
                                  // value remains in the data graph.
                                  renderer.selectValueOrOption(uiComponent, value, valueIndex, index);
                              }}">
                              <div class="${twMerge(classes.orSelectorLabelClass)}">
                                  ${until(labeledValue.then(res => res.label))}
                              </div>
                              ${until(labeledValue.then(res => res.description ? html`
                                  <div class="${twMerge(classes.orSelectorDescriptionClass)}">
                                      ${res.description}
                                  </div>
                              ` : nothing), nothing)}
                          </li>
                      `})}
               </ul>
           ` : nothing}
       </div>
   `;
}

export function renderLabel(uiComponent: UIComponent, classes: TailwindClasses) {
   // Associate the label with the first value's input (ids are `${uuid}-${index}`),
   // giving click-to-focus and screen-reader association for single-value fields.
   return html`
       <label class="${twMerge(classes.labelClass)}" for="${uiComponent.uuid}-0">
           ${uiComponent.label}
       </label>
   `;
}

export function renderPlusIcon(renderer: ShaclRenderer, uiComponent: UIComponent, classes: TailwindClasses) {
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

export function renderXIcon(uiComponent: UIComponent, classes: TailwindClasses, onClick: () => void, floatRight: boolean = true) {
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

export function renderSelectWidgetIcon(renderer: ShaclRenderer, uiComponent: UIComponent, value: UIComponentValue, index: number, classes: TailwindClasses) {
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
               // A property that references a node shape via sh:node declares the entity's class on
               // that node shape (sh:class). Type the newly-created entity accordingly so a
               // DetailsEditor default value is a well-formed instance of the expected class.
               if (addToDatastore && uiComponent.node && renderer.shapesStore) {
                  for (const classQuad of renderer.shapesStore.getQuads(uiComponent.node, SH('class'), null)) {
                     renderer.addToDataStore(newFocusNode, {path: rdf('type'), type: 'predicate'}, classQuad.object);
                  }
               }
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

export function addChildrenToDataStore(renderer: ShaclRenderer, children: UIComponent[]) {
   for (const child of children) {
      if (child.focusNode && child.paths.length > 0 && child.values.length > 0) {
         for (const value of child.values) {
            renderer.addToDataStore(child.focusNode, value.path, value.value);

            // Type each nested entity value with the sh:class declared on the node shape it
            // references via sh:node, so a cloned DetailsEditor child is a well-formed instance of
            // the expected class (the class lives on the child node shape, not the property shape).
            if (child.node && renderer.shapesStore && value.value.termType !== "Literal") {
               for (const classQuad of renderer.shapesStore.getQuads(child.node, SH('class'), null)) {
                  renderer.addToDataStore(value.value, {path: rdf('type'), type: 'predicate'}, classQuad.object);
               }
            }
         }

         // Recursively add grandchildren to the data store
         if (child.children) {
            child.children.forEach(grandChildren => addChildrenToDataStore(renderer, grandChildren));
         }
      }
   }
}

export function getDataType(uiComponent: UIComponent, value: UIComponentValue): string | undefined {
   if (value.value.termType === "Literal") {
      return (value.value as Literal).datatype.value;
   }
   return uiComponent.datatype;
}
