import type {RdfStore} from "rdf-stores";
import type {Quad, Quad_Object} from "rdf-js";
import type {Term} from "@rdfjs/types";
import type {Path} from "../types.ts";
import {SH} from "./namespaces.ts";
import {extractAlternativePaths} from "./rdf-list.ts";

/**
 * Resolves an `sh:path` object into one or more {@link Path}s. Supports plain predicate
 * paths, `sh:inversePath`, and `sh:alternativePath` (flattened into multiple paths).
 */
export function extractPaths(constraintNode: Term, shapesGraph: RdfStore<any, Quad>, pathObject: Quad_Object): Path[] {
   if (pathObject.termType === "NamedNode") {
      return [{path: pathObject.value, type: "predicate"}];
   }
   if (pathObject.termType === "BlankNode") {
      const inversePathQuad = shapesGraph.getQuads(pathObject, SH("inversePath"), null)[0];
      if (inversePathQuad && inversePathQuad.object.termType === "NamedNode") {
         return [{path: inversePathQuad.object.value, type: "inverse"}];
      }
      const alternativePathQuad = shapesGraph.getQuads(pathObject, SH("alternativePath"), null)[0];
      if (alternativePathQuad) {
         const alternativePaths = extractAlternativePaths(alternativePathQuad.object, shapesGraph);
         return alternativePaths.map(alternativePathQuadObject => extractPaths(constraintNode, shapesGraph, alternativePathQuadObject)).flat();
      }
      console.warn(`Unsupported blank node path for constraint ${constraintNode.value}, skipping path extraction for this constraint`);
      return [];
   }
   console.warn(`Unsupported path type ${pathObject.termType} for constraint ${constraintNode.value}, skipping path extraction for this constraint`);
   return [];
}
