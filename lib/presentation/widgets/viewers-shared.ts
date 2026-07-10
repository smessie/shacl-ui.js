// Shared helpers for the read-only viewer widgets (view mode).
import {until} from "lit/directives/until.js";
import {type UIComponentValue} from "../../types.ts";
import {ShaclRenderer} from "../../shacl-renderer.ts";
import {toLabeledValue} from "../../core/labels.ts";

/** Shorten an IRI to its last fragment/path segment for display fallbacks. */
export function shortLabel(iri: string): string {
   return iri.split('#').pop()?.split('/').pop() || iri;
}

/** Resolve a term's human-readable label, falling back to `fallback` while the promise resolves. */
export function labelText(renderer: ShaclRenderer, value: UIComponentValue, fallback: string) {
   return until(
      toLabeledValue(value.value, renderer.dataStore!, renderer.shapesStore!, renderer.labelConfig)
         .then(lv => lv.label || fallback),
      fallback,
   );
}
