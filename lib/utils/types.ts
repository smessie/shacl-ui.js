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
   defaultWidgets?: WidgetScore[];
   values: UIComponentValue[];
   children?: UIComponent[][];
   defaultChild?: UIComponent[];
   options?: LabeledValue[];
   singleLine?: boolean;
   notInShapesGraph?: boolean;
   minCount?: number;
   maxCount?: number;
   classes?: ClassValue[];
   instances?: LabeledValue[];
   rootClass?: Term;
   subclasses?: LabeledValue[];
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
   class?: Term;
   widgets?: WidgetScore[];
   selectedWidget?: string;
}

export type UIGroup = {
   iri: Term;
   label?: string;
   order?: number;
}

export type ClassValue = {
   iri: Term;
   value: LabeledValue;
   children?: UIComponent[];
}

export type LabeledValue = {
   value: Term;
   label: string;
   description?: string;
}

export type WidgetScore = {
   widget: LabeledValue;
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
   selectWidgetIconClass?: string;
   selectWidgetDropdownClass?: string;
   selectWidgetOptionClass?: string;
   selectWidgetOptionSelectedClass?: string;
   selectWidgetLabelClass?: string;
   selectWidgetDescriptionClass?: string;
   selectWidgetScoreClass?: string;
   subClassEditorClass?: string;
   subClassEditorDropdownClass?: string;
   subClassEditorOptionClass?: string;
   subClassEditorOptionSelectedClass?: string;
   subClassEditorLabelClass?: string;
   subClassEditorDescriptionClass?: string;
   detailsClassSelectClass?: string;
   detailsClassSelectDropdownClass?: string;
   detailsClassSelectOptionClass?: string;
   detailsClassSelectOptionSelectedClass?: string;
   detailsClassSelectLabelClass?: string;
   detailsClassSelectDescriptionClass?: string;
   instancesSelectEditorClass?: string;
   instancesSelectEditorIconClass?: string;
   instancesSelectEditorDropdownClass?: string;
   instancesSelectEditorOptionClass?: string;
   instancesSelectEditorOptionSelectedClass?: string;
   instancesSelectEditorLabelClass?: string;
   instancesSelectEditorDescriptionClass?: string;
};
