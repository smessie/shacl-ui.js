import type {RdfStore} from "rdf-stores";
import type {Quad, Quad_Object, Term} from "@rdfjs/types";
import {DataFactory} from "rdf-data-factory";
import type {Path} from "../types.ts";
import {RDF as RDF_, SH} from "./namespaces.ts";
import {extractAlternativePaths, extractShaclList} from "./rdf-list.ts";

const df = new DataFactory();

/**
 * Resolves an `sh:path` object into one or more {@link Path}s. Supports plain predicate
 * paths, `sh:inversePath`, and `sh:alternativePath` (flattened into multiple paths).
 */
export function extractPaths(constraintNode: Term, shapesGraph: RdfStore<any, Quad>, pathObject: Quad_Object, silent: boolean = false): Path[] {
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
         return alternativePaths.map(alternativePathQuadObject => extractPaths(constraintNode, shapesGraph, alternativePathQuadObject, silent)).flat();
      }
      if (!silent) console.warn(`Unsupported blank node path for constraint ${constraintNode.value}, skipping path extraction for this constraint`);
      return [];
   }
   if (!silent) console.warn(`Unsupported path type ${pathObject.termType} for constraint ${constraintNode.value}, skipping path extraction for this constraint`);
   return [];
}

// ---------------------------------------------------------------------------
// Full SHACL property path expressions (view-mode value collection).
// ---------------------------------------------------------------------------

/** Parsed SHACL property path expression tree. */
export type PathExpr =
   | {kind: 'predicate'; iri: string}
   | {kind: 'inverse'; path: PathExpr}
   | {kind: 'sequence'; paths: PathExpr[]}
   | {kind: 'alternative'; paths: PathExpr[]}
   | {kind: 'zeroOrMore'; path: PathExpr}
   | {kind: 'oneOrMore'; path: PathExpr}
   | {kind: 'zeroOrOne'; path: PathExpr};

/**
 * Parses an `sh:path` object into a {@link PathExpr}, covering the full SHACL property path
 * syntax: predicate, inverse, sequence (RDF list), alternative, zero-or-more, one-or-more and
 * zero-or-one paths, arbitrarily nested. Returns `undefined` for unrecognized structures.
 */
export function parsePathExpr(pathObject: Term, shapesGraph: RdfStore<any, Quad>): PathExpr | undefined {
   if (pathObject.termType === "NamedNode") {
      return {kind: 'predicate', iri: pathObject.value};
   }
   if (pathObject.termType !== "BlankNode") {
      return undefined;
   }
   const sub = (predicate: string): Term | undefined =>
      shapesGraph.getQuads(pathObject, SH(predicate), null)[0]?.object;

   const inverse = sub("inversePath");
   if (inverse) {
      const inner = parsePathExpr(inverse, shapesGraph);
      return inner ? {kind: 'inverse', path: inner} : undefined;
   }
   const alternative = sub("alternativePath");
   if (alternative) {
      const members = extractShaclList(alternative, shapesGraph).map(m => parsePathExpr(m, shapesGraph));
      return members.every((m): m is PathExpr => m !== undefined) && members.length > 0
         ? {kind: 'alternative', paths: members}
         : undefined;
   }
   const zeroOrMore = sub("zeroOrMorePath");
   if (zeroOrMore) {
      const inner = parsePathExpr(zeroOrMore, shapesGraph);
      return inner ? {kind: 'zeroOrMore', path: inner} : undefined;
   }
   const oneOrMore = sub("oneOrMorePath");
   if (oneOrMore) {
      const inner = parsePathExpr(oneOrMore, shapesGraph);
      return inner ? {kind: 'oneOrMore', path: inner} : undefined;
   }
   const zeroOrOne = sub("zeroOrOnePath");
   if (zeroOrOne) {
      const inner = parsePathExpr(zeroOrOne, shapesGraph);
      return inner ? {kind: 'zeroOrOne', path: inner} : undefined;
   }
   // A blank node with rdf:first is a sequence path (an RDF list of sub-paths).
   if (shapesGraph.getQuads(pathObject, RDF_("first"), null).length > 0) {
      const members = extractShaclList(pathObject, shapesGraph).map(m => parsePathExpr(m, shapesGraph));
      return members.every((m): m is PathExpr => m !== undefined) && members.length > 0
         ? {kind: 'sequence', paths: members}
         : undefined;
   }
   return undefined;
}

/** Serializes a {@link PathExpr} to a SPARQL-property-path-like string (for labels/keys). */
export function serializePathExpr(expr: PathExpr): string {
   switch (expr.kind) {
      case 'predicate': return `<${expr.iri}>`;
      case 'inverse': return `^${serializePathExpr(expr.path)}`;
      case 'sequence': return expr.paths.map(serializePathExpr).join('/');
      case 'alternative': return `(${expr.paths.map(serializePathExpr).join('|')})`;
      case 'zeroOrMore': return `${serializePathExpr(expr.path)}*`;
      case 'oneOrMore': return `${serializePathExpr(expr.path)}+`;
      case 'zeroOrOne': return `${serializePathExpr(expr.path)}?`;
   }
}

/** Removes duplicate terms (by term type + value), preserving first-seen order. */
function dedupe(terms: Term[]): Term[] {
   const seen = new Set<string>();
   return terms.filter(t => {
      const key = `${t.termType}:${t.value}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
   });
}

/**
 * Evaluates a {@link PathExpr} against the data graph, returning all value nodes reachable
 * from `startNodes` via the path (SHACL/SPARQL property path semantics). Cycle-safe: the
 * closure operators track visited nodes.
 */
export function evaluatePathExpr(startNodes: Term[], expr: PathExpr, dataGraph: RdfStore): Term[] {
   switch (expr.kind) {
      case 'predicate':
         return dedupe(startNodes.flatMap(node =>
            dataGraph.getQuads(node, df.namedNode(expr.iri), null).map(q => q.object)));
      case 'inverse': {
         if (expr.path.kind === 'predicate') {
            const predicate = df.namedNode(expr.path.iri);
            return dedupe(startNodes.flatMap(node =>
               dataGraph.getQuads(null, predicate, node).map(q => q.subject)));
         }
         console.warn(`sh:inversePath of a non-predicate path is not supported, returning no values`);
         return [];
      }
      case 'sequence':
         return expr.paths.reduce((nodes, part) => evaluatePathExpr(nodes, part, dataGraph), startNodes);
      case 'alternative':
         return dedupe(expr.paths.flatMap(part => evaluatePathExpr(startNodes, part, dataGraph)));
      case 'zeroOrOne':
         return dedupe([...startNodes, ...evaluatePathExpr(startNodes, expr.path, dataGraph)]);
      case 'zeroOrMore':
      case 'oneOrMore': {
         const visited = new Set<string>();
         const result: Term[] = [];
         let frontier = expr.kind === 'zeroOrMore' ? [...startNodes] : evaluatePathExpr(startNodes, expr.path, dataGraph);
         while (frontier.length > 0) {
            const next: Term[] = [];
            for (const node of frontier) {
               const key = `${node.termType}:${node.value}`;
               if (visited.has(key)) continue;
               visited.add(key);
               result.push(node);
               next.push(node);
            }
            frontier = evaluatePathExpr(next, expr.path, dataGraph);
         }
         return result;
      }
   }
}
