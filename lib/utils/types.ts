import type {Term} from "@rdfjs/types";

export type UIComponent = {
   iri: Term;
   path: string;
   label?: string;
   description?: string;
   datatype?: string;
   defaultWidget?: string;
   values: UIComponentValue[];
   options?: Term[];
   singleLine?: boolean;
   notInShapesGraph?: boolean;
   minCount?: number;
   maxCount?: number;
};

export type UIComponentValue = {
   value: Term;
   widgets?: WidgetScore[];
   selectedWidget?: string;
}

export type WidgetScore = {
   widget: string;
   source: string;
   score: number;
};

export type TailwindClasses = {
   labelClass?: string;
   globalFieldClass?: string;
   globalInputFieldClass?: string;
   textFieldEditorClass?: string;
   textAreaEditorClass?: string;
   numberFieldEditorClass?: string;
   booleanSelectEditorClass?: string;
   booleanSelectEditorLabelClass?: string;
   datePickerEditorClass?: string;
   dateTimePickerEditorClass?: string;
   enumSelectEditorClass?: string;
   enumSelectEditorIconClass?: string;
   iriEditorClass?: string;
   plusIconClass?: string;
   xIconClass?: string;
};
