import {rdfParser} from "rdf-parse";
import str from "string-to-stream";
import {RdfStore} from "rdf-stores";
import {rdfDereferencer} from "rdf-dereference";
import type {Stream, Term} from "@rdfjs/types";
import * as RDF from "rdf-js";
import {type Quad} from "rdf-js";
import {DataFactory} from "rdf-data-factory";
import {write} from '@jeswr/pretty-turtle';

const df: RDF.DataFactory = new DataFactory();

export async function parseRdf(content: string, contentType: string) {
   if (!content || content.trim().length === 0) {
      return RdfStore.createDefault();
   }
   const textStream = str(content);
   const quadStream = rdfParser.parse(textStream, {contentType});

   return await streamToStore(quadStream);
}

export async function dereferenceRdf(url: string): Promise<RdfStore> {
   const resp = await rdfDereferencer.dereference(url);
   return await streamToStore(resp.data);
}

async function streamToStore(stream: Stream): Promise<RdfStore> {
   const store = RdfStore.createDefault();
   await new Promise((resolve, reject) => {
      store.import(stream).on("end", resolve).on("error", reject);
   });
   return store;
}

export async function serializeRdf(quads: Quad[], contentType: string): Promise<string> {
   return await write(quads, {
      format: contentType,
      prefixes: {
         sh: "http://www.w3.org/ns/shacl#",
         shui: "http://www.w3.org/ns/shacl-ui/",
         xsd: "http://www.w3.org/2001/XMLSchema#",
         rdf: "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
         rdfc: "https://w3id.org/rdf-connect#",
         ex: "http://example.org/",
      },
   });
}

export function mutateTerm(term: Term, value?: string, languageOrDatatype?: string | RDF.NamedNode | RDF.DirectionalLanguage): Term {
   if (!term) {
      return term;
   }
   switch (term.termType) {
      case "NamedNode":
         return df.namedNode(value ?? term.value);
      case "BlankNode":
         return df.blankNode(value ?? term.value);
      case "Literal":
         return df.literal(value ?? term.value, languageOrDatatype ?? (term.language || term.datatype));
      case "Variable":
         return df.variable!(value ?? term.value);
      case "DefaultGraph":
         return df.defaultGraph();
      default:
         throw new Error(`Unknown term type: ${term.termType}`);
   }
}

export async function expandPrefixedIRI(prefixed: string): Promise<string> {
   // If the prefixed IRI is actually already expanded, return it as is
   if (!prefixed.includes(':') || prefixed.startsWith('http://') || prefixed.startsWith('https://') || prefixed.startsWith('urn:')) {
      return prefixed;
   }
   const [prefix, suffix] = prefixed.split(':');
   try {
      const response = await fetch(
         `https://prefixcc-proxy.smessie.com/${prefix}.file.json`,
      );
      const json = await response.json();
      const namespace = json[prefix];
      if (namespace) {
         prefixed = namespace + suffix;
      }
   } catch (_) {
   }
   return prefixed;
}
