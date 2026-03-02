import {rdfParser} from "rdf-parse";
import str from "string-to-stream";
import {RdfStore} from "rdf-stores";
import {rdfDereferencer} from "rdf-dereference";
import type {Stream, Term} from "@rdfjs/types";
import {rdfSerializer} from "rdf-serialize";
import * as RDF from "rdf-js";
import {type Quad} from "rdf-js";
import {streamifyArray} from "streamify-array";
import stringifyStream from "stream-to-string";
import {DataFactory} from "rdf-data-factory";

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
   const quadStream = streamifyArray(quads);
   const textStream = rdfSerializer.serialize(quadStream, {contentType});
   return await stringifyStream(textStream);
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
