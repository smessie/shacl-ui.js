import type {RdfStore} from "rdf-stores";
import {RdfStore as RdfStoreImpl} from "rdf-stores";
import type {Term} from "@rdfjs/types";
import type {LabeledValue} from "../types.ts";
import {DCTERMS, RDFS, SCHEMA, SH, SKOS} from "./namespaces.ts";
import {rdfDereferencer} from "rdf-dereference";

/**
 * Resolves a human-readable label and description for a term by looking up common label
 * predicates (rdfs:label, dcterms:title, skos:prefLabel, schema:name, sh:name) in the data
 * graph then the shapes graph. When `dereferenceForLabelResolution` is set and nothing was
 * found, the term's IRI (and an LOV mirror) is dereferenced as a fallback. Falls back to the
 * term's IRI as the label.
 */
export async function toLabeledValue(term: Term, dataGraph: RdfStore, shapesGraph: RdfStore, dereferenceForLabelResolution: boolean): Promise<LabeledValue> {
   let labelQuad = dataGraph.getQuads(term, RDFS("label"), null)[0]
      || dataGraph.getQuads(term, DCTERMS("title"), null)[0]
      || dataGraph.getQuads(term, SKOS("prefLabel"), null)[0]
      || dataGraph.getQuads(term, SCHEMA("name"), null)[0]
      // Or try to retrieve label from shapes graph if not found in data graph.
      || shapesGraph.getQuads(term, RDFS("label"), null)[0]
      || shapesGraph.getQuads(term, DCTERMS("title"), null)[0]
      || shapesGraph.getQuads(term, SKOS("prefLabel"), null)[0]
      || shapesGraph.getQuads(term, SCHEMA("name"), null)[0]
      || shapesGraph.getQuads(term, SH("name"), null)[0];

   let descriptionQuad = dataGraph.getQuads(term, RDFS("comment"), null)[0]
      || dataGraph.getQuads(term, DCTERMS("description"), null)[0]
      // Or try to retrieve description from shapes graph if not found in data graph.
      || shapesGraph.getQuads(term, RDFS("comment"), null)[0]
      || shapesGraph.getQuads(term, DCTERMS("description"), null)[0]
      || shapesGraph.getQuads(term, SH("description"), null)[0];

   if (dereferenceForLabelResolution) {
      // If still no label found, we will try to dereference the term and try to get the label from the dereferenced graph.
      for (const iriToDereference of [term.value, `https://ajuvercr.github.io/lov-mirror/by-iri/${encodeURIComponent(encodeURIComponent(term.value))}.ttl`]) {
         if ((!labelQuad || !descriptionQuad) && term.termType === "NamedNode") {
            try {
               const dereferencedGraph = RdfStoreImpl.createDefault();
               const dereferencedOutput = await rdfDereferencer.dereference(iriToDereference, {headers: {"Accept": "application/n-quads,text/turtle;q=0.95,application/ld+json;q=0.9,application/n-triples;q=0.8,*/*;q=0.1"}});
               await new Promise((resolve, reject) => {
                  dereferencedGraph.import(dereferencedOutput.data).on("end", resolve).on("error", reject);
               });
               if (!labelQuad) {
                  labelQuad = dereferencedGraph.getQuads(term, RDFS("label"), null)[0]
                     || dereferencedGraph.getQuads(term, DCTERMS("title"), null)[0]
                     || dereferencedGraph.getQuads(term, SKOS("prefLabel"), null)[0]
                     || dereferencedGraph.getQuads(term, SCHEMA("name"), null)[0];
               }
               if (!descriptionQuad) {
                  descriptionQuad = dereferencedGraph.getQuads(term, RDFS("comment"), null)[0]
                     || dereferencedGraph.getQuads(term, DCTERMS("description"), null)[0];
               }
            } catch (error) {
               // Ignore dereferencing errors.
            }
         }
      }
   }

   return {
      value: term,
      label: labelQuad ? labelQuad.object.value : term.value,
      description: descriptionQuad ? descriptionQuad.object.value : undefined,
   }
}
