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
   nodeKind?: Term;
   orNode?: OrNode[];
   orDatatype?: OrDatatype[];
   orClass?: OrClass[];
   selectedOrIndex?: number;
   hasValue?: Term;
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
   /** Which or-option (index into orNode / orDatatype / orClass) this specific value uses. */
   selectedOrIndex?: number;
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

export type OrNode = {
   node: Term;
   values: UIComponentValue[];
   children?: UIComponent[][];
   defaultChild?: UIComponent[];
}

export type OrDatatype = {
   datatype: string;
}

export type OrClass = {
   class: Term;
   classValue: ClassValue;
   instances: LabeledValue[];
}

/** One option in a root-level (NodeShape) sh:or list. */
export type RootOrOption = {
   /** The node shape term for this option (IRI or BlankNode). */
   node: Term;
   /** Human-readable label from sh:name on the option node shape. */
   label?: string;
   /** Human-readable description from sh:description on the option node shape. */
   description?: string;
};

/**
 * Represents one sh:or constraint found directly on the root NodeShape.
 * The user picks one option; the selected option's sh:property entries are
 * merged with the base shape's sh:property entries.
 */
export type RootOrGroup = {
   /** The blank-node term that heads the sh:or RDF list (used as a stable key). */
   orListNode: Term;
   options: RootOrOption[];
   /** Index of the currently selected option (default 0). */
   selectedIndex: number;
   /**
    * Optional sort order for this sh:or section, read from sh:order on the
    * list-head blank node.  Used to interleave with base sh:property components.
    */
   order?: number;
};

/**
 * Pairs the sh:or group metadata with the UIComponents built from the currently
 * selected option's sh:property list.  Used exclusively for rendering the
 * root-level or-section card (selector + selected option's fields).
 */
export type RootOrSection = {
   /** Metadata for the or-group selector (options, selectedIndex, list-head term). */
   group: RootOrGroup;
   /** UIComponents for the currently selected option's sh:property entries. */
   components: UIComponent[];
};

/**
 * One rendering slot in the interleaved top-level render list.
 *
 * - `'component'`  – a single ungrouped base UIComponent (from sh:property).
 * - `'group'`      – all UIComponents that share a sh:group, rendered together.
 * - `'orSection'`  – one root-level sh:or section (selector + selected option's fields).
 */
export type RootRenderSlot =
   | { kind: 'component'; component: UIComponent }
   | { kind: 'group'; components: UIComponent[] }
   | { kind: 'orSection'; section: RootOrSection; groupIndex: number };

export type TailwindClasses = {
   componentClass?: string;
   spinnerClass?: string;
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
   richTextEditorClass?: string;
   richTextEditorToolbarClass?: string;
   richTextEditorButtonClass?: string;
   richTextEditorSelectClass?: string;
   richTextEditorContentClass?: string;
   richTextEditorRawContentClass?: string;
   orSelectorClass?: string;
   orSelectorDropdownClass?: string;
   orSelectorOptionClass?: string;
   orSelectorOptionSelectedClass?: string;
   orSelectorLabelClass?: string;
   orSelectorDescriptionClass?: string;
};
