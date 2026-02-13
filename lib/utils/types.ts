import type {Term} from "@rdfjs/types";

export type UIComponent = {
   iri: Term;
   focusNode?: Term;
   path: string;
   pathType: PathType;
   node?: Term;
   label?: string;
   description?: string;
   datatype?: string;
   defaultWidget?: string;
   values: UIComponentValue[];
   children?: UIComponent[][];
   defaultChild?: UIComponent[];
   options?: Term[];
   singleLine?: boolean;
   notInShapesGraph?: boolean;
   minCount?: number;
   maxCount?: number;
   class?: Term;
   instances?: LabeledValue[];
};

export type PathType = "predicate" | "inverse" | "alternative" | "sequence";

export type UIComponentValue = {
   value: Term;
   widgets?: WidgetScore[];
   selectedWidget?: string;
}

export type LabeledValue = {
   value: Term;
   label: string;
   description?: string;
}

export type WidgetScore = {
   widget: string;
   source: string;
   score: number;
};

export type TailwindClasses = {
   labelClass?: string;
   descriptionClass?: string;
   globalFieldClass?: string;
   globalInputFieldClass?: string;
   autoCompleteEditorClass?: string;
   autoCompleteEditorDropdownClass?: string;
   autoCompleteEditorOptionClass?: string;
   autoCompleteEditorLabelClass?: string;
   autoCompleteEditorDescriptionClass?: string;
   blankNodeEditorClass?: string;
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
   childComponentClass?: string;
};
