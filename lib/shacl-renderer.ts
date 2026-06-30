import {css, html, LitElement, type PropertyValues, unsafeCSS} from 'lit'
import {customElement, property, state} from 'lit/decorators.js'
import {TW} from "./shared/tailwindMixin";
import type {RdfStore} from "rdf-stores";
import {dereferenceRdf, parseRdf, serializeRdf} from "./utils/rdf.ts";
import {constructUiComponents, uiComponentsToQuads} from "./utils/ui.ts";
import {renderRootSlots} from "./utils/widgets.ts";
import type {Path, RootOrGroup, RootRenderSlot, TailwindClasses, UIComponent} from "./utils/types.ts";
import * as RDF from "rdf-js";
import {type Quad, type Quad_Object, type Quad_Subject} from "rdf-js";
import {DataFactory} from "rdf-data-factory";
import type {Term} from "@rdfjs/types";
import tailwindStyles from './styles/tailwind.global.css?inline';
import './styles/tailwind.global.css';
import {twMerge} from 'tailwind-merge';

const df: RDF.DataFactory = new DataFactory();

const TwLitElement = TW(LitElement);
/**
 * The main element of this library.
 *
 * @dataGraph The RDF graph containing the domain data being edited or viewed, as a string. Not required if dataGraphUrl is provided.
 * @dataGraphContentType The content type of the data graph (e.g., 'text/turtle'). Required if dataGraph is provided.
 * @dataGraphUrl The URL to fetch the data graph from. Not required if dataGraph is provided.
 * @shapesGraph The RDF graph containing the SHACL shapes that define constraints on the data graph, as a string. Not required if shapesGraphUrl is provided.
 * @shapesGraphContentType The content type of the shapes graph (e.g., 'text/turtle'). Required if shapesGraph is provided.
 * @shapesGraphUrl The URL to fetch the shapes graph from. Not required if shapesGraph is provided.
 * @widgetScoringGraph The RDF graph containing shui:WidgetScore instances that define how widgets are scored, as a string. Not required if widgetScoringGraphUrl is provided.
 * @widgetScoringGraphContentType The content type of the widget scoring graph (e.g., 'text/turtle'). Required if widgetScoringGraph is provided.
 * @widgetScoringGraphUrl The URL to fetch the widget scoring graph from. Not required if widgetScoringGraph is provided.
 * @focusNode The RDF node IRI in the data graph whose value is being edited or viewed.
 * @constraintShape The shape IRI in the shapes graph that constrains the focus node in the current editing or viewing context.
 *
 * Styling attributes – each is merged on top of the built-in default via tailwind-merge,
 * so you only need to supply the classes you want to override or add.
 *
 * @globalFieldClass Tailwind CSS classes applied to all field containers.
 * @labelClass Tailwind CSS classes applied to all field labels.
 * @globalInputFieldClass Tailwind CSS classes applied to all input fields.
 * @textFieldEditorClass Tailwind CSS classes applied to text field editors.
 * @textAreaEditorClass Tailwind CSS classes applied to text area editors.
 * @numberFieldEditorClass Tailwind CSS classes applied to number field editors.
 * @booleanEditorClass Tailwind CSS classes applied to boolean select editors.
 * @booleanEditorLabelClass Tailwind CSS classes applied to boolean select editor labels.
 * @datePickerEditorClass Tailwind CSS classes applied to date picker editors.
 * @dateTimePickerEditorClass Tailwind CSS classes applied to date-time picker editors.
 * @enumSelectEditorClass Tailwind CSS classes applied to enumeration select editors.
 * @enumSelectEditorIconClass Tailwind CSS classes applied to enumeration select editor icons.
 * @detailsEditorClass Tailwind CSS classes applied to details editors used for editing nested shapes.
 * @plusIconClass Tailwind CSS classes applied to plus icons used for adding values.
 * @xIconClass Tailwind CSS classes applied to x icons used for removing values.
 * @orSelectorClass Tailwind CSS classes applied to sh:or selector containers.
 * @orSelectorDropdownClass Tailwind CSS classes applied to sh:or selector dropdowns.
 * @orSelectorOptionClass Tailwind CSS classes applied to sh:or selector options.
 * @orSelectorLabelClass Tailwind CSS classes applied to sh:or selector labels.
 * @orSelectorDescriptionClass Tailwind CSS classes applied to sh:or selector descriptions.
 */
@customElement('shacl-renderer')
export class ShaclRenderer extends TwLitElement {

  /**
   * Default Tailwind CSS classes for every styling slot.
   * When a user provides a class attribute it is merged on top of these defaults
   * via tailwind-merge, so conflicts are resolved in favour of the user's value
   * while unchanged defaults are preserved.
   */
  static readonly DEFAULTS: Required<TailwindClasses> = {
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
  };

  static styles = [css`${unsafeCSS(tailwindStyles)}`];

  @state()
  loading: boolean = true;

  /** Human-readable message shown instead of the form when graph parsing/UI construction fails. */
  @state()
  error: string | null = null;

  @property({type: Boolean})
  useLightDom: boolean = false;

  @property({ reflect: true })
  theme: 'dark' | 'light' = window.matchMedia("(prefers-color-scheme: dark)").matches ? 'dark' : 'light';

  @property({type: Boolean})
  dereferenceForLabelResolution: boolean = false;

  @property({type: Boolean})
  expandPrefixes: boolean = true;

  @property({type: Boolean})
  preferSkolemizedBlankNodes: boolean = false;

  @property()
  dataGraph: string = '';

  @property()
  dataGraphContentType: string = '';

  @property()
  dataGraphUrl: string = '';

  @state()
  dataStore: RdfStore | null = null;

  @property()
  shapesGraph: string = '';

  @property()
  shapesGraphContentType: string = '';

  @property()
  shapesGraphUrl: string = '';

  @state()
  shapesStore: RdfStore | null = null;

  @property()
  widgetScoringGraph: string = '';

  @property()
  widgetScoringGraphContentType: string = '';

  @property()
  widgetScoringGraphUrl: string = '';

  @state()
  widgetScoringStore: RdfStore | null = null;

  @property()
  focusNode: string = '';

  @property()
  constraintShape: string = '';

  // ── Styling slots ────────────────────────────────────────────────────────────
  // Every property defaults to '' (empty string). In render() each slot is
  // resolved as twMerge(ShaclRenderer.DEFAULTS.<slot>, this.<slot>), so the
  // user's value is layered on top of the built-in default.

  @property() componentClass: string = '';
  @property() spinnerClass: string = '';
  @property() labelClass: string = '';
  @property() descriptionClass: string = '';
  @property() globalFieldClass: string = '';
  @property() globalInputFieldClass: string = '';
  @property() autoCompleteEditorClass: string = '';
  @property() autoCompleteEditorDropdownClass: string = '';
  @property() autoCompleteEditorOptionClass: string = '';
  @property() autoCompleteEditorLabelClass: string = '';
  @property() autoCompleteEditorDescriptionClass: string = '';
  @property() blankNodeEditorClass: string = '';
  @property() textFieldEditorClass: string = '';
  @property() textAreaEditorClass: string = '';
  @property() numberFieldEditorClass: string = '';
  @property() booleanEditorClass: string = '';
  @property() booleanEditorLabelClass: string = '';
  @property() datePickerEditorClass: string = '';
  @property() dateTimePickerEditorClass: string = '';
  @property() enumSelectEditorClass: string = '';
  @property() enumSelectEditorIconClass: string = '';
  @property() iriEditorClass: string = '';
  @property() detailsEditorClass: string = '';
  @property() plusIconClass: string = '';
  @property() xIconClass: string = '';
  @property() groupClass: string = '';
  @property() groupLabelClass: string = '';
  @property() groupElementClass: string = '';
  @property() alternativePathDescriptionClass: string = '';
  @property() alternativePathSelectClass: string = '';
  @property() alternativePathOptionClass: string = '';
  @property() alternativePathOptionSelectedClass: string = '';
  @property() selectWidgetIconClass: string = '';
  @property() selectWidgetDropdownClass: string = '';
  @property() selectWidgetOptionClass: string = '';
  @property() selectWidgetOptionSelectedClass: string = '';
  @property() selectWidgetLabelClass: string = '';
  @property() selectWidgetDescriptionClass: string = '';
  @property() selectWidgetScoreClass: string = '';
  @property() subClassEditorClass: string = '';
  @property() subClassEditorDropdownClass: string = '';
  @property() subClassEditorOptionClass: string = '';
  @property() subClassEditorOptionSelectedClass: string = '';
  @property() subClassEditorLabelClass: string = '';
  @property() subClassEditorDescriptionClass: string = '';
  @property() detailsClassSelectClass: string = '';
  @property() detailsClassSelectDropdownClass: string = '';
  @property() detailsClassSelectOptionClass: string = '';
  @property() detailsClassSelectOptionSelectedClass: string = '';
  @property() detailsClassSelectLabelClass: string = '';
  @property() detailsClassSelectDescriptionClass: string = '';
  @property() instancesSelectEditorClass: string = '';
  @property() instancesSelectEditorIconClass: string = '';
  @property() instancesSelectEditorDropdownClass: string = '';
  @property() instancesSelectEditorOptionClass: string = '';
  @property() instancesSelectEditorOptionSelectedClass: string = '';
  @property() instancesSelectEditorLabelClass: string = '';
  @property() instancesSelectEditorDescriptionClass: string = '';
  @property() richTextEditorClass: string = '';
  @property() richTextEditorToolbarClass: string = '';
  @property() richTextEditorButtonClass: string = '';
  @property() richTextEditorSelectClass: string = '';
  @property() richTextEditorContentClass: string = '';
  @property() richTextEditorRawContentClass: string = '';
  @property() orSelectorClass: string = '';
  @property() orSelectorDropdownClass: string = '';
  @property() orSelectorOptionClass: string = '';
  @property() orSelectorOptionSelectedClass: string = '';
  @property() orSelectorLabelClass: string = '';
  @property() orSelectorDescriptionClass: string = '';

  @state()
  ui: UIComponent[] = [];

  /**
   * Unified sorted rendering list.  Each slot is either an ungrouped base
   * UIComponent, a cluster of grouped UIComponents, or a root-level sh:or section.
   * This replaces the old separate baseComponents + rootOrSections state.
   */
  @state()
  renderSlots: RootRenderSlot[] = [];

  /** Group metadata for selectRootOrOption state management. */
  @state()
  rootOrGroups: RootOrGroup[] = [];

  @state()
  rootOrSelectOpen: Record<string, boolean> = {};

  @state()
  autoCompleteEditorOpen: Record<string, boolean> = {};

  @state()
  autoCompleteEditorFilter: Record<string, string> = {};

  @state()
  enumSelectEditorOpen: Record<string, boolean> = {};

  @state()
  alternativePathSelectOpen: Record<string, boolean> = {};

  @state()
  selectWidgetIconOpen: Record<string, boolean> = {};

  @state()
  subClassEditorOpen: Record<string, boolean> = {};

  @state()
  subClassEditorFilter: Record<string, string> = {};

  @state()
  detailsClassSelectOpen: Record<string, boolean> = {};

  @state()
  detailsClassSelectFilter: Record<string, string> = {};

  @state()
  instancesSelectEditorOpen: Record<string, boolean> = {};

  @state()
  richTextHtmlMode: Record<string, boolean> = {};

  @state()
  orSelectOpen: Record<string, boolean> = {};

  createRenderRoot() {
    return this.useLightDom ? this : super.createRenderRoot();
  }

  /** Media query used to follow the OS colour-scheme while no explicit `theme` is set. */
  private readonly colorSchemeQuery: MediaQueryList = window.matchMedia("(prefers-color-scheme: dark)");
  private readonly onColorSchemeChange = (e: MediaQueryListEvent) => {
    // Only follow the OS when the consumer hasn't pinned a theme via the attribute.
    if (!this.hasAttribute('theme')) {
      this.theme = e.matches ? 'dark' : 'light';
    }
  };

  override connectedCallback() {
    super.connectedCallback();
    this.colorSchemeQuery.addEventListener('change', this.onColorSchemeChange);
  }

  override disconnectedCallback() {
    this.colorSchemeQuery.removeEventListener('change', this.onColorSchemeChange);
    super.disconnectedCallback();
  }

  /** Resolve a single styling slot by merging the built-in default with the user override. */
  private m(key: keyof TailwindClasses): string {
    return twMerge(ShaclRenderer.DEFAULTS[key], (this[key] as string));
  }

  render() {
    const tailwindClasses: TailwindClasses = {
      componentClass: this.m('componentClass'),
      spinnerClass: this.m('spinnerClass'),
      labelClass: this.m('labelClass'),
      descriptionClass: this.m('descriptionClass'),
      globalFieldClass: this.m('globalFieldClass'),
      globalInputFieldClass: this.m('globalInputFieldClass'),
      autoCompleteEditorClass: this.m('autoCompleteEditorClass'),
      autoCompleteEditorDropdownClass: this.m('autoCompleteEditorDropdownClass'),
      autoCompleteEditorOptionClass: this.m('autoCompleteEditorOptionClass'),
      autoCompleteEditorLabelClass: this.m('autoCompleteEditorLabelClass'),
      autoCompleteEditorDescriptionClass: this.m('autoCompleteEditorDescriptionClass'),
      blankNodeEditorClass: this.m('blankNodeEditorClass'),
      textFieldEditorClass: this.m('textFieldEditorClass'),
      textAreaEditorClass: this.m('textAreaEditorClass'),
      numberFieldEditorClass: this.m('numberFieldEditorClass'),
      booleanEditorClass: this.m('booleanEditorClass'),
      booleanEditorLabelClass: this.m('booleanEditorLabelClass'),
      datePickerEditorClass: this.m('datePickerEditorClass'),
      dateTimePickerEditorClass: this.m('dateTimePickerEditorClass'),
      enumSelectEditorClass: this.m('enumSelectEditorClass'),
      enumSelectEditorIconClass: this.m('enumSelectEditorIconClass'),
      iriEditorClass: this.m('iriEditorClass'),
      plusIconClass: this.m('plusIconClass'),
      xIconClass: this.m('xIconClass'),
      detailsEditorClass: this.m('detailsEditorClass'),
      groupClass: this.m('groupClass'),
      groupLabelClass: this.m('groupLabelClass'),
      groupElementClass: this.m('groupElementClass'),
      alternativePathDescriptionClass: this.m('alternativePathDescriptionClass'),
      alternativePathSelectClass: this.m('alternativePathSelectClass'),
      alternativePathOptionClass: this.m('alternativePathOptionClass'),
      alternativePathOptionSelectedClass: this.m('alternativePathOptionSelectedClass'),
      selectWidgetIconClass: this.m('selectWidgetIconClass'),
      selectWidgetDropdownClass: this.m('selectWidgetDropdownClass'),
      selectWidgetOptionClass: this.m('selectWidgetOptionClass'),
      selectWidgetOptionSelectedClass: this.m('selectWidgetOptionSelectedClass'),
      selectWidgetLabelClass: this.m('selectWidgetLabelClass'),
      selectWidgetDescriptionClass: this.m('selectWidgetDescriptionClass'),
      selectWidgetScoreClass: this.m('selectWidgetScoreClass'),
      subClassEditorClass: this.m('subClassEditorClass'),
      subClassEditorDropdownClass: this.m('subClassEditorDropdownClass'),
      subClassEditorOptionClass: this.m('subClassEditorOptionClass'),
      subClassEditorOptionSelectedClass: this.m('subClassEditorOptionSelectedClass'),
      subClassEditorLabelClass: this.m('subClassEditorLabelClass'),
      subClassEditorDescriptionClass: this.m('subClassEditorDescriptionClass'),
      detailsClassSelectClass: this.m('detailsClassSelectClass'),
      detailsClassSelectDropdownClass: this.m('detailsClassSelectDropdownClass'),
      detailsClassSelectOptionClass: this.m('detailsClassSelectOptionClass'),
      detailsClassSelectOptionSelectedClass: this.m('detailsClassSelectOptionSelectedClass'),
      detailsClassSelectLabelClass: this.m('detailsClassSelectLabelClass'),
      detailsClassSelectDescriptionClass: this.m('detailsClassSelectDescriptionClass'),
      instancesSelectEditorClass: this.m('instancesSelectEditorClass'),
      instancesSelectEditorIconClass: this.m('instancesSelectEditorIconClass'),
      instancesSelectEditorDropdownClass: this.m('instancesSelectEditorDropdownClass'),
      instancesSelectEditorOptionClass: this.m('instancesSelectEditorOptionClass'),
      instancesSelectEditorOptionSelectedClass: this.m('instancesSelectEditorOptionSelectedClass'),
      instancesSelectEditorLabelClass: this.m('instancesSelectEditorLabelClass'),
      instancesSelectEditorDescriptionClass: this.m('instancesSelectEditorDescriptionClass'),
      richTextEditorClass: this.m('richTextEditorClass'),
      richTextEditorToolbarClass: this.m('richTextEditorToolbarClass'),
      richTextEditorButtonClass: this.m('richTextEditorButtonClass'),
      richTextEditorSelectClass: this.m('richTextEditorSelectClass'),
      richTextEditorContentClass: this.m('richTextEditorContentClass'),
      richTextEditorRawContentClass: this.m('richTextEditorRawContentClass'),
      orSelectorClass: this.m('orSelectorClass'),
      orSelectorDropdownClass: this.m('orSelectorDropdownClass'),
      orSelectorOptionClass: this.m('orSelectorOptionClass'),
      orSelectorOptionSelectedClass: this.m('orSelectorOptionSelectedClass'),
      orSelectorLabelClass: this.m('orSelectorLabelClass'),
      orSelectorDescriptionClass: this.m('orSelectorDescriptionClass'),
    }
    const renderer = this;
    return html`
      <div class="${this.m('componentClass')}">
        ${this.error
           ? html`
             <div class="text-red-600 dark:text-red-400 p-4" role="alert">
               ${this.error}
             </div>
           `
           : this.loading
           ? html`
             <div class="flex items-center justify-center py-10">
               <div
                  class="${this.m('spinnerClass')}">
               </div>
             </div>
           `
           : html`
             ${renderRootSlots(renderer, this.renderSlots, tailwindClasses)}
           `}
      </div>
    `;
  }

  rerender() {
    // Shallow-copy each tracked array so Lit detects the change and re-renders.
    // All UIComponent instances are shared by reference so in-place mutations
    // (e.g. value edits) propagate automatically.
    this.ui = [...this.ui];
    this.renderSlots = [...this.renderSlots];
  }

  /**
   * Called by the root-level sh:or selector when the user picks a different option.
   * Rebuilds the UI with the selected option's sh:property list merged with the base shape.
   */
  async selectRootOrOption(groupIndex: number, optionIndex: number) {
    const updatedGroups: RootOrGroup[] = this.rootOrGroups.map((g, i) =>
      i === groupIndex ? {...g, selectedIndex: optionIndex} : g,
    );
    // Close dropdown immediately.
    const key = this.rootOrGroups[groupIndex]?.orListNode.value;
    if (key) this.setRootOrSelectOpen(key, false);

    if (this.shapesStore && this.dataStore && this.widgetScoringStore && this.constraintShape) {
      this.loading = true;
      try {
        const result = await constructUiComponents(
          this,
          this.shapesStore,
          df.namedNode(this.constraintShape),
          this.dataStore,
          this.focusNode ? df.namedNode(this.focusNode) : undefined,
          this.widgetScoringStore,
          updatedGroups,
        );
        this.ui = result.components;
        this.renderSlots = result.renderSlots;
        this.rootOrGroups = result.rootOrGroups;
        this.error = null;
      } catch (err) {
        console.error('shacl-renderer: failed to rebuild UI for sh:or selection', err);
        this.error = err instanceof Error ? err.message : String(err);
      } finally {
        this.loading = false;
      }
    }
  }

  /**
   * Retrieves the current data graph entered by the user in the form as a string in the specified content type.
   * If contentType is not provided, returns the data graph as an array of RDF quads.
   * @param contentType
   * @returns {Promise<string | Quad[]>} The current data graph as a string in the specified content type, or as an array of quads if no content type is provided.
   */
  async data(contentType?: string): Promise<string | Quad[]> {
    const outputQuads = uiComponentsToQuads(this.ui);
    if (contentType) {
      return await serializeRdf(outputQuads, contentType);
    }
    return outputQuads;
  }

  setAlternativePathSelectOpen(key: string, value: boolean) {
    this.alternativePathSelectOpen = {
      ...this.alternativePathSelectOpen,
      [key]: value
    }
  }

  setAutoCompleteEditorOpen(key: string, value: boolean) {
    this.autoCompleteEditorOpen = {
      ...this.autoCompleteEditorOpen,
      [key]: value
    };
  }

  setAutoCompleteEditorFilter(key: string, value: string) {
    this.autoCompleteEditorFilter = {
      ...this.autoCompleteEditorFilter,
      [key]: value
    };
  }

  setEnumSelectEditorOpen(key: string, value: boolean) {
    this.enumSelectEditorOpen = {
      ...this.enumSelectEditorOpen,
      [key]: value
    };
  }

  setSelectWidgetIconOpen(key: string, value: boolean) {
    this.selectWidgetIconOpen = {
      ...this.selectWidgetIconOpen,
      [key]: value
    };
  }

  setSubClassEditorOpen(key: string, value: boolean) {
    this.subClassEditorOpen = {
      ...this.subClassEditorOpen,
      [key]: value
    };
  }

  setSubClassEditorFilter(key: string, value: string) {
    this.subClassEditorFilter = {
      ...this.subClassEditorFilter,
      [key]: value
    };
  }

  setDetailsClassSelectOpen(key: string, value: boolean) {
    this.detailsClassSelectOpen = {
      ...this.detailsClassSelectOpen,
      [key]: value
    };
  }

  setDetailsClassSelectFilter(key: string, value: string) {
    this.detailsClassSelectFilter = {
      ...this.detailsClassSelectFilter,
      [key]: value
    };
  }

  setInstancesSelectEditorOpen(key: string, value: boolean) {
    this.instancesSelectEditorOpen = {
      ...this.instancesSelectEditorOpen,
      [key]: value
    };
  }

  setOrSelectOpen(key: string, value: boolean) {
    this.orSelectOpen = {
      ...this.orSelectOpen,
      [key]: value
    };
  }

  setRootOrSelectOpen(key: string, value: boolean) {
    this.rootOrSelectOpen = {
      ...this.rootOrSelectOpen,
      [key]: value,
    };
  }

  addToDataStore(focusNode?: Term, path?: Path, value?: Term) {
    if (this.dataStore && focusNode && path && value) {
      const pathTerm = df.namedNode(path.path);
      if (path.type === "predicate") {
        this.dataStore.addQuad(df.quad(focusNode as Quad_Subject, pathTerm, value as Quad_Object));
      } else if (path.type === "inverse") {
        this.dataStore.addQuad(df.quad(value as Quad_Subject, pathTerm, focusNode as Quad_Object));
      } else {
        console.warn(`Unsupported path type for addition: ${path.type}`);
      }
    } else {
      console.warn('Cannot add to data store: missing dataStore, focusNode, path, or value');
    }
  }

  removeFromDataStore(focusNode?: Term, path?: Path, value?: Term, child?: UIComponent[]) {
    if (child) {
      for (const childComponent of child) {
        for (const [index, childValue] of childComponent.values.entries()) {
          this.removeFromDataStore(childComponent.focusNode, childValue.path, childValue.value, childComponent.children?.[index]);
        }
      }
    }
    if (this.dataStore && focusNode && path && value) {
      const pathTerm = df.namedNode(path.path);
      if (path.type === "predicate") {
        this.dataStore.removeMatches(focusNode, pathTerm, value);
      } else if (path.type === "inverse") {
        this.dataStore.removeMatches(value, pathTerm, focusNode);
      } else {
        console.warn(`Unsupported path type for removal: ${path.type}`);
      }
    } else {
      console.warn('Cannot remove from data store: missing dataStore, focusNode, path, or value');
    }
  }

  protected async willUpdate(changedProperties: PropertyValues) {
    let reconstructUi = false;
    try {
      if ((changedProperties.has('dataGraph') || changedProperties.has('dataGraphContentType')) && this.dataGraph && this.dataGraph.trim().length !== 0 && this.dataGraphContentType && this.dataGraphContentType.trim().length !== 0) {
        this.loading = true;
        this.dataStore = await parseRdf(this.dataGraph, this.dataGraphContentType);
        reconstructUi = true;
      }
      if (changedProperties.has('dataGraphUrl') && this.dataGraphUrl && this.dataGraphUrl.trim().length !== 0) {
        this.loading = true;
        this.dataStore = await dereferenceRdf(new URL(this.dataGraphUrl, window.location.href).href);
        reconstructUi = true;
      }
      if (changedProperties.has('shapesGraph') || changedProperties.has('shapesGraphContentType')) {
        this.loading = true;
        this.shapesStore = await parseRdf(this.shapesGraph, this.shapesGraphContentType);
        reconstructUi = true;
      }
      if (changedProperties.has('shapesGraphUrl') && this.shapesGraphUrl && this.shapesGraphUrl.trim().length !== 0) {
        this.loading = true;
        this.shapesStore = await dereferenceRdf(new URL(this.shapesGraphUrl, window.location.href).href);
        reconstructUi = true;
      }
      if (changedProperties.has('widgetScoringGraph') || changedProperties.has('widgetScoringGraphContentType')) {
        this.loading = true;
        this.widgetScoringStore = await parseRdf(this.widgetScoringGraph, this.widgetScoringGraphContentType);
        reconstructUi = true;
      }
      if (changedProperties.has('widgetScoringGraphUrl') && this.widgetScoringGraphUrl && this.widgetScoringGraphUrl.trim().length !== 0) {
        this.loading = true;
        this.widgetScoringStore = await dereferenceRdf(new URL(this.widgetScoringGraphUrl, window.location.href).href);
        reconstructUi = true;
      }
      if (reconstructUi && this.shapesStore && this.focusNode && this.focusNode.trim().length !== 0 && this.dataStore && this.widgetScoringStore && this.constraintShape && this.constraintShape.trim().length !== 0) {
        const result = await constructUiComponents(this, this.shapesStore, df.namedNode(this.constraintShape), this.dataStore, this.focusNode ? df.namedNode(this.focusNode) : undefined, this.widgetScoringStore);
        this.ui = result.components;
        this.renderSlots = result.renderSlots;
        this.rootOrGroups = result.rootOrGroups;
        this.error = null;
        this.loading = false;
      }
    } catch (err) {
      console.error('shacl-renderer: failed to parse graphs or construct the UI', err);
      this.error = err instanceof Error ? err.message : String(err);
      this.loading = false;
    }
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'shacl-renderer': ShaclRenderer
  }
}
