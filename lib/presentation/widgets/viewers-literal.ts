// Literal-valued viewers (view mode): plain literal, language string, hyperlink and HTML.
import {html, nothing} from "lit";
import {twMerge} from "tailwind-merge";
import {type Literal} from "@rdfjs/types";
import {type TailwindClasses, type UIComponent, type UIComponentValue} from "../../types.ts";
import {ShaclRenderer} from "../../shacl-renderer.ts";
import {sanitizeHtml, isSafeLinkUrl} from "./shared.ts";

/** shui:LiteralViewer — the lexical form of any literal. */
export function renderLiteralViewer(_renderer: ShaclRenderer, _uiComponent: UIComponent, value: UIComponentValue, _index: number, classes: TailwindClasses) {
   return html`<span class="${twMerge(classes.literalViewerClass)}">${value.value.value}</span>`;
}

/** shui:LangStringViewer — the text plus a language-tag indicator. */
export function renderLangStringViewer(_renderer: ShaclRenderer, _uiComponent: UIComponent, value: UIComponentValue, _index: number, classes: TailwindClasses) {
   const lang = (value.value as Literal).language;
   return html`
       <span class="${twMerge(classes.langStringViewerClass)}">
           <span>${value.value.value}</span>
           ${lang ? html`<span class="${twMerge(classes.langStringViewerTagClass)}">${lang}</span>` : nothing}
       </span>
   `;
}

/** shui:HyperlinkViewer — a clickable hyperlink to the URI/URL held in a literal. */
export function renderHyperlinkViewer(_renderer: ShaclRenderer, _uiComponent: UIComponent, value: UIComponentValue, _index: number, classes: TailwindClasses) {
   const url = value.value.value;
   if (!isSafeLinkUrl(url)) {
      return html`<span class="${twMerge(classes.hyperlinkViewerClass, 'no-underline')}">${url}</span>`;
   }
   return html`
       <a class="${twMerge(classes.hyperlinkViewerClass)}" href="${url}" target="_blank" rel="noopener noreferrer">
           <span>${url}</span>
           <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5"
                stroke="currentColor" class="size-3.5 shrink-0 opacity-70">
               <path stroke-linecap="round" stroke-linejoin="round"
                     d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"/>
           </svg>
       </a>
   `;
}

/** shui:HTMLViewer — the literal parsed into (sanitized) HTML DOM elements. */
export function renderHTMLViewer(_renderer: ShaclRenderer, _uiComponent: UIComponent, value: UIComponentValue, _index: number, classes: TailwindClasses) {
   const lang = (value.value as Literal).language;
   return html`
       <div class="${twMerge(classes.htmlViewerClass)}">
           <div .innerHTML="${sanitizeHtml(value.value.value ?? '')}"></div>
           ${lang ? html`<span class="${twMerge(classes.langStringViewerTagClass)}">${lang}</span>` : nothing}
       </div>
   `;
}
