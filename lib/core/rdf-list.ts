import type {RdfStore} from "rdf-stores";
import type {Quad, Quad_Object, Term} from "@rdfjs/types";
import {rdf, RDF as RDF_, RDFS} from "./namespaces.ts";

/**
 * Walks an `rdf:first`/`rdf:rest` list and returns its members. A visited-set guards
 * against malformed or cyclic lists, which would otherwise loop forever (the input can
 * come from an arbitrary URL).
 */
export function extractShaclList(listNode: Term, shapesGraph: RdfStore<any, Quad>): Term[] {
   const options: Term[] = [];
   const visited = new Set<string>();
   let currentNode = listNode;
   while (currentNode.value !== rdf("nil")) {
      if (visited.has(currentNode.value)) break; // guard against malformed/cyclic lists
      visited.add(currentNode.value);
      const firstQuad = shapesGraph.getQuads(currentNode, RDF_("first"), null)[0];
      if (firstQuad) {
         options.push(firstQuad.object);
      }
      const restQuad = shapesGraph.getQuads(currentNode, RDF_("rest"), null)[0];
      if (restQuad) {
         currentNode = restQuad.object;
      } else {
         break;
      }
   }
   return options;
}

/** Walks an `sh:alternativePath` list, returning only its named-node members. Cycle-safe. */
export function extractAlternativePaths(alternativePathNode: Term, shapesGraph: RdfStore<any, Quad>): Quad_Object[] {
   const paths: Quad_Object[] = [];
   const visited = new Set<string>();
   let currentNode = alternativePathNode;
   while (currentNode.value !== rdf("nil")) {
      if (visited.has(currentNode.value)) break; // guard against malformed/cyclic lists
      visited.add(currentNode.value);
      const firstQuad = shapesGraph.getQuads(currentNode, RDF_("first"), null)[0];
      if (firstQuad && firstQuad.object.termType === "NamedNode") {
         paths.push(firstQuad.object);
      }
      const restQuad = shapesGraph.getQuads(currentNode, RDF_("rest"), null)[0];
      if (restQuad) {
         currentNode = restQuad.object;
      } else {
         break;
      }
   }
   return paths;
}

/**
 * Collects all transitive `rdfs:subClassOf` subclasses of `rootClass` into `subclasses`.
 * The visited set (seeded with the root) guards against cyclic/diamond hierarchies.
 */
export async function extractSubclasses(rootClass: Term, dataGraph: RdfStore, shapesGraph: RdfStore, subclasses: Term[], visited: Set<string> = new Set<string>([rootClass.value])): Promise<void> {
   const subclassObjects = [... dataGraph.getQuads(null, RDFS("subClassOf"), rootClass).map(quad => quad.subject), ...shapesGraph.getQuads(null, RDFS("subClassOf"), rootClass).map(quad => quad.subject)];
   for (const subclass of subclassObjects) {
      if (visited.has(subclass.value)) continue; // guard against cyclic/diamond subclass hierarchies
      visited.add(subclass.value);
      subclasses.push(subclass);
      await extractSubclasses(subclass, dataGraph, shapesGraph, subclasses, visited);
   }
}
