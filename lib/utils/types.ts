import type {Term} from "@rdfjs/types";

export type UIComponent = {
   uuid: string;
   iri: Term;
   focusNode?: Term;
   paths: Path[];
   node?: Term;
   label?: string;
   description?: string;
   datatype?: string;
   defaultWidget?: string;
   values: UIComponentValue[];
   children?: UIComponent[][];
   defaultChild?: UIComponent[];
   options?: LabeledValue[];
   singleLine?: boolean;
   notInShapesGraph?: boolean;
   minCount?: number;
   maxCount?: number;
   class?: Term;
   instances?: LabeledValue[];
   pattern?: string;
   minInclusive?: string;
   maxInclusive?: string;
   order?: number;
   group?: UIGroup;
};

export type PathType = "predicate" | "inverse" | "alternative" | "sequence";

export type Path = {
   path: string;
   type: PathType;
};

export type UIComponentValue = {
   value: Term;
   path: Path;
   widgets?: WidgetScore[];
   selectedWidget?: string;
}

export type UIGroup = {
   iri: Term;
   label?: string;
   order?: number;
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
   booleanEditorClass?: string;
   booleanEditorLabelClass?: string;
   datePickerEditorClass?: string;
   dateTimePickerEditorClass?: string;
   enumSelectEditorClass?: string;
   enumSelectEditorIconClass?: string;
   iriEditorClass?: string;
   detailsEditorClass?: string;
   plusIconClass?: string;
   xIconClass?: string;
   groupClass?: string;
   groupLabelClass?: string;
   groupElementClass?: string;
   alternativePathDescriptionClass?: string;
   alternativePathSelectClass?: string;
   alternativePathOptionClass?: string;
   alternativePathOptionSelectedClass?: string;
};
