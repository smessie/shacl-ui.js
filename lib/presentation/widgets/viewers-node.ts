// Node-valued viewers (view mode): IRI link, labelled IRI link, blank node and image.
import {html} from "lit";
import {twMerge} from "tailwind-merge";
import {type TailwindClasses, type UIComponent, type UIComponentValue} from "../../types.ts";
import {ShaclRenderer} from "../../shacl-renderer.ts";
import {toLabeledValue} from "../../core/labels.ts";
import {isSafeLinkUrl} from "./shared.ts";
import {labelText, shortLabel} from "./viewers-shared.ts";
import {until} from "lit/directives/until.js";

/** shui:IRIViewer — a hyperlink to the IRI, showing the IRI. */
export function renderIRIViewer(_renderer: ShaclRenderer, _uiComponent: UIComponent, value: UIComponentValue, _index: number, classes: TailwindClasses) {
   const iri = value.value.value;
   if (!isSafeLinkUrl(iri)) {
      return html`<span class="${twMerge(classes.iriViewerClass, 'no-underline cursor-default')}">${iri}</span>`;
   }
   return html`<a class="${twMerge(classes.iriViewerClass)}" href="${iri}" target="_blank" rel="noopener noreferrer">${iri}</a>`;
}

/** shui:LabelViewer — a hyperlink to the IRI based on the resource's display label. */
export function renderLabelViewer(renderer: ShaclRenderer, _uiComponent: UIComponent, value: UIComponentValue, _index: number, classes: TailwindClasses) {
   const iri = value.value.value;
   const text = labelText(renderer, value, shortLabel(iri));
   if (!isSafeLinkUrl(iri)) {
      return html`<span class="${twMerge(classes.iriViewerClass, 'no-underline cursor-default')}" title="${iri}">${text}</span>`;
   }
   return html`<a class="${twMerge(classes.iriViewerClass)}" href="${iri}" target="_blank" rel="noopener noreferrer" title="${iri}">${text}</a>`;
}

/** shui:BlankNodeViewer — a human-readable label of the blank node (falls back to its `_:id`). */
export function renderBlankNodeViewer(renderer: ShaclRenderer, _uiComponent: UIComponent, value: UIComponentValue, _index: number, classes: TailwindClasses) {
   const raw = value.value.value;
   const fallback = `_:${raw}`;
   const text = until(
      toLabeledValue(value.value, renderer.dataStore!, renderer.shapesStore!, renderer.labelConfig)
         // toLabeledValue falls back to the term's raw id when no label predicate exists; show `_:id` then.
         .then(lv => (lv.label && lv.label !== raw) ? lv.label : fallback),
      fallback,
   );
   return html`<span class="${twMerge(classes.blankNodeViewerClass)}">${text}</span>`;
}

/** shui:ImageViewer — the image at the given URL, with a text fallback when it fails to load. */
export function renderImageViewer(_renderer: ShaclRenderer, uiComponent: UIComponent, value: UIComponentValue, _index: number, classes: TailwindClasses) {
   const src = value.value.value;
   return html`
       <span>
           <img class="${twMerge(classes.imageViewerClass)}"
                src="${src}"
                alt="${uiComponent.label ?? src}"
                loading="lazy"
                @error="${(e: Event) => {
                    const img = e.target as HTMLImageElement;
                    img.style.display = 'none';
                    const fallback = img.nextElementSibling as HTMLElement | null;
                    if (fallback) fallback.style.display = 'inline';
                }}"/>
           <span class="${twMerge(classes.literalViewerClass)}" style="display:none">${src}</span>
       </span>
   `;
}
