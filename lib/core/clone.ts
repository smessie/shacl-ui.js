import type {Term} from "@rdfjs/types";
import * as RDF from "@rdfjs/types";
import {DataFactory} from "rdf-data-factory";

const df: RDF.DataFactory = new DataFactory();

function isTerm(value: unknown): value is Term {
   return !!value
      && typeof value === "object"
      && typeof (value as Term).termType === "string"
      && typeof (value as Term).value === "string"
      && typeof (value as { equals?: unknown }).equals === "function";
}

/**
 * Deep-clones a UIComponent (or any of its nested structures) in a term-aware way.
 *
 * Unlike `structuredClone`, this re-creates every RDF term via `df.fromTerm` so the
 * clones keep their prototype methods (`.equals`, etc.) that the data store and value
 * comparisons rely on, and it assigns a fresh `uuid` to every component in the tree so
 * per-field state keys (`${uuid}-...`) do not collide between repeated rows.
 */
export function cloneUiComponent<T>(value: T): T {
   if (Array.isArray(value)) {
      return value.map(item => cloneUiComponent(item)) as unknown as T;
   }
   if (isTerm(value)) {
      return df.fromTerm(value as any) as unknown as T;
   }
   if (value && typeof value === "object") {
      const out: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(value)) {
         out[key] = key === "uuid" ? self.crypto.randomUUID() : cloneUiComponent(val);
      }
      return out as T;
   }
   return value;
}
