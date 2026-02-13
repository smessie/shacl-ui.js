import * as RDFJS from "rdf-js";
import {DataFactory} from "rdf-data-factory";
import type {NamedNode} from "@rdfjs/types";

const df: RDFJS.DataFactory = new DataFactory();

export function sh(property: string): string {
   return `http://www.w3.org/ns/shacl#${property}`;
}

export function SH(property: string): NamedNode {
   return df.namedNode(sh(property));
}

export function shui(property: string): string {
   return `http://www.w3.org/ns/shacl-ui#${property}`;
}

export function SHUI(property: string): NamedNode {
   return df.namedNode(shui(property));
}

export function xsd(property: string): string {
   return `http://www.w3.org/2001/XMLSchema#${property}`;
}

export function XSD(property: string): NamedNode {
   return df.namedNode(xsd(property));
}

export function rdf(property: string): string {
   return `http://www.w3.org/1999/02/22-rdf-syntax-ns#${property}`;
}

export function RDF(property: string): NamedNode {
   return df.namedNode(rdf(property));
}

export function rdfs(property: string): string {
   return `http://www.w3.org/2000/01/rdf-schema#${property}`;
}

export function RDFS(property: string): NamedNode {
   return df.namedNode(rdfs(property));
}

export function dcterms(property: string): string {
   return `http://purl.org/dc/terms/${property}`;
}

export function DCTERMS(property: string): NamedNode {
   return df.namedNode(dcterms(property));
}

export function prefix(full?: string): string | undefined {
   if (!full) return full;
   full = full.replace('http://www.w3.org/ns/shacl#', 'sh:');
   full = full.replace('http://www.w3.org/ns/shacl-ui#', 'shui:');
   full = full.replace('http://www.w3.org/2001/XMLSchema#', 'xsd:');
   full = full.replace('http://www.w3.org/1999/02/22-rdf-syntax-ns#', 'rdf:');
   full = full.replace('http://www.w3.org/2000/01/rdf-schema#', 'rdfs:');
   full = full.replace('http://example.org/', 'ex:');
   return full;
}
