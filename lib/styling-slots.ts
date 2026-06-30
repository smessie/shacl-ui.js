/**
 * Single source of truth for the component's Tailwind styling slots.
 *
 * Each entry maps a slot name to its built-in default classes. The Lit element derives
 * everything from this record:
 *   • the reactive `@property` declarations (one string attribute per slot),
 *   • the `DEFAULTS` map,
 *   • the merged `TailwindClasses` object passed to the widgets (default + user override).
 *
 * To add, remove, or restyle a slot, edit this record only.
 */
export const STYLING_SLOTS = {
   componentClass: 'bg-white dark:bg-zinc-800',
   spinnerClass: 'h-8 w-8 animate-spin rounded-full border-4 border-zinc-300 border-t-zinc-700 dark:border-zinc-700 dark:border-t-zinc-200',
   labelClass: 'block text-zinc-700 dark:text-zinc-100 text-sm font-bold mb-1',
   descriptionClass: '-mt-1 text-xs text-zinc-500 dark:text-zinc-200 mb-2',
   globalFieldClass: 'text-zinc-700 dark:text-zinc-100 leading-tight mb-2',
   globalInputFieldClass: 'w-full shadow appearance-none border dark:border-zinc-200 rounded py-2 px-3 pr-8 focus:outline-none focus:shadow-outline focus:border-zinc-400 dark:focus:border-zinc-300',
   autoCompleteEditorClass: 'relative',
   autoCompleteEditorDropdownClass: 'absolute z-50 w-full bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-600 rounded-md shadow-lg mt-1 max-h-60 overflow-auto',
   autoCompleteEditorOptionClass: 'px-3 py-2 cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-700',
   autoCompleteEditorLabelClass: 'font-medium',
   autoCompleteEditorDescriptionClass: 'text-sm text-zinc-500 dark:text-zinc-200',
   blankNodeEditorClass: '',
   textFieldEditorClass: '',
   textAreaEditorClass: '',
   numberFieldEditorClass: '',
   booleanEditorClass: 'mr-2',
   booleanEditorLabelClass: '',
   datePickerEditorClass: '',
   dateTimePickerEditorClass: '',
   enumSelectEditorClass: '',
   enumSelectEditorIconClass: 'h-4 w-4 text-zinc-500 dark:text-zinc-400',
   iriEditorClass: '',
   detailsEditorClass: 'ml-4 border-l dark:border-zinc-200 pl-4 relative',
   plusIconClass: 'size-6 float-right text-green-600 dark:text-green-400 cursor-pointer hover:text-green-700 dark:hover:text-green-500',
   xIconClass: 'size-5 -mr-1 mt-4 cursor-pointer text-zinc-900 dark:text-zinc-50',
   groupClass: 'md:flex md:gap-x-4 md:flex-wrap',
   groupLabelClass: 'font-bold md:basis-full dark:text-zinc-50 text-zinc-800',
   groupElementClass: 'md:flex-1',
   alternativePathDescriptionClass: 'text-xs italic text-zinc-500 dark:text-zinc-200 mb-2 -mt-1 hover:text-zinc-700 dark:hover:text-zinc-100 cursor-pointer',
   alternativePathSelectClass: 'absolute z-50 bg-white dark:bg-zinc-800 border dark:border-zinc-600 rounded shadow-md -mt-t',
   alternativePathOptionClass: 'px-2 py-1 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-700 cursor-pointer',
   alternativePathOptionSelectedClass: 'font-bold',
   selectWidgetIconClass: 'size-6 cursor-pointer text-zinc-500 dark:text-zinc-200 hover:text-zinc-700 dark:hover:text-zinc-100',
   selectWidgetDropdownClass: 'absolute right-0 mt-2 origin-top-right transform translate-x-0 z-50 min-w-64 bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-600 rounded-md shadow-lg max-h-80 w-md overflow-auto max-w-[85vw]',
   selectWidgetOptionClass: 'px-4 py-2 cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-700',
   selectWidgetOptionSelectedClass: 'bg-zinc-100 dark:bg-zinc-700',
   selectWidgetLabelClass: 'font-medium text-zinc-800 dark:text-zinc-200',
   selectWidgetDescriptionClass: 'text-sm text-zinc-500 dark:text-zinc-400',
   selectWidgetScoreClass: 'text-xs text-zinc-400 dark:text-zinc-500 ml-3',
   subClassEditorClass: 'relative',
   subClassEditorDropdownClass: 'absolute z-50 w-full bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-600 rounded-md shadow-lg mt-1 max-h-60 overflow-auto',
   subClassEditorOptionClass: 'px-3 py-2 cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-700',
   subClassEditorOptionSelectedClass: 'bg-zinc-100 dark:bg-zinc-700',
   subClassEditorLabelClass: 'font-medium',
   subClassEditorDescriptionClass: 'text-sm text-zinc-500 dark:text-zinc-400',
   detailsClassSelectClass: 'relative',
   detailsClassSelectDropdownClass: 'absolute z-50 w-full bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-600 rounded-md shadow-lg mt-1 max-h-60 overflow-auto',
   detailsClassSelectOptionClass: 'px-3 py-2 cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-700',
   detailsClassSelectOptionSelectedClass: 'bg-zinc-100 dark:bg-zinc-700',
   detailsClassSelectLabelClass: 'font-medium',
   detailsClassSelectDescriptionClass: 'text-sm text-zinc-500 dark:text-zinc-400',
   instancesSelectEditorClass: 'relative min-h-9',
   instancesSelectEditorIconClass: 'size-4 text-zinc-500 dark:text-zinc-400',
   instancesSelectEditorDropdownClass: 'absolute z-50 w-full bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-600 rounded-md shadow-lg mt-1 max-h-60 overflow-auto',
   instancesSelectEditorOptionClass: 'px-3 py-2 cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-700',
   instancesSelectEditorOptionSelectedClass: 'bg-zinc-100 dark:bg-zinc-700',
   instancesSelectEditorLabelClass: 'font-medium',
   instancesSelectEditorDescriptionClass: 'text-sm text-zinc-500 dark:text-zinc-400',
   richTextEditorClass: 'border dark:border-zinc-600 rounded-md shadow-sm',
   richTextEditorToolbarClass: 'flex flex-wrap gap-1 border-b dark:border-zinc-600 rounded-t-md bg-zinc-50 dark:bg-zinc-800 p-2 pr-8',
   richTextEditorButtonClass: 'px-2 py-1 text-sm hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded cursor-pointer justify-center flex items-center',
   richTextEditorSelectClass: 'text-sm border dark:border-zinc-600 rounded px-1 cursor-pointer',
   richTextEditorContentClass: 'min-h-50 p-3 focus:outline-none prose max-w-none',
   richTextEditorRawContentClass: 'w-full min-h-50 p-2 focus:outline-none',
   orSelectorClass: 'relative',
   orSelectorDropdownClass: 'absolute z-50 w-full bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-600 rounded-md shadow-lg mt-1 max-h-60 overflow-auto',
   orSelectorOptionClass: 'px-3 py-2 cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-700',
   orSelectorOptionSelectedClass: 'bg-zinc-100 dark:bg-zinc-700',
   orSelectorLabelClass: 'font-medium',
   orSelectorDescriptionClass: 'text-sm text-zinc-500 dark:text-zinc-200',
} as const;

/** Names of every styling slot. */
export type StylingSlot = keyof typeof STYLING_SLOTS;

/** The list of slot names, used to derive reactive properties and the merged class map. */
export const STYLING_SLOT_NAMES = Object.keys(STYLING_SLOTS) as StylingSlot[];
