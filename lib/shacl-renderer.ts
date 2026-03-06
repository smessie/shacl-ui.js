import {css, html, LitElement, type PropertyValues, unsafeCSS} from 'lit'
import {customElement, property, state} from 'lit/decorators.js'
import {TW} from "./shared/tailwindMixin";
import type {RdfStore} from "rdf-stores";
import {dereferenceRdf, parseRdf, serializeRdf} from "./utils/rdf.ts";
import {constructUiComponents, uiComponentsToQuads} from "./utils/ui.ts";
import {renderUIComponents} from "./utils/widgets.ts";
import type {Path, TailwindClasses, UIComponent} from "./utils/types.ts";
import * as RDF from "rdf-js";
import {type Quad, type Quad_Object, type Quad_Subject} from "rdf-js";
import {DataFactory} from "rdf-data-factory";
import type {Term} from "@rdfjs/types";
import tailwindStyles from './styles/tailwind.global.css?inline';
import './styles/tailwind.global.css';

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
 */
@customElement('shacl-renderer')
export class ShaclRenderer extends TwLitElement {

  static styles = [css`${unsafeCSS(tailwindStyles)}`];

  loading: boolean = true;

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

  @property()
  widgetScoringStore: RdfStore | null = null;

  @property()
  focusNode: string = '';

  @property()
  constraintShape: string = '';


  @property()
  componentClass: string = 'bg-white dark:bg-zinc-800';

  @property()
  spinnerClass: string = 'h-8 w-8 animate-spin rounded-full border-4 border-zinc-300 border-t-zinc-700 dark:border-zinc-700 dark:border-t-zinc-200';

  @property()
  labelClass: string = 'block text-zinc-700 dark:text-zinc-100 text-sm font-bold mb-1';

  @property()
  descriptionClass: string = '-mt-1 text-xs text-zinc-500 dark:text-zinc-200 mb-2';

  @property()
  globalFieldClass: string = 'text-zinc-700 dark:text-zinc-100 leading-tight mb-2';

  @property()
  globalInputFieldClass: string = 'w-full shadow appearance-none border dark:border-zinc-200 rounded py-2 px-3 pr-8 focus:outline-none focus:shadow-outline focus:border-zinc-400 dark:focus:border-zinc-300';

  @property()
  autoCompleteEditorClass: string = 'relative';

  @property()
  autoCompleteEditorDropdownClass: string = 'absolute z-50 w-full bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-600 rounded-md shadow-lg mt-1 max-h-60 overflow-auto';

  @property()
  autoCompleteEditorOptionClass: string = 'px-3 py-2 cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-700';

  @property()
  autoCompleteEditorLabelClass: string = 'font-medium';

  @property()
  autoCompleteEditorDescriptionClass: string = 'text-sm text-zinc-500 dark:text-zinc-200';

  @property()
  blankNodeEditorClass: string = '';

  @property()
  textFieldEditorClass: string = '';

  @property()
  textAreaEditorClass: string = '';

  @property()
  numberFieldEditorClass: string = '';

  @property()
  booleanEditorClass: string = 'mr-2';

  @property()
  booleanEditorLabelClass: string = '';

  @property()
  datePickerEditorClass: string = '';

  @property()
  dateTimePickerEditorClass: string = '';

  @property()
  enumSelectEditorClass: string = '';

  @property()
  enumSelectEditorIconClass: string = 'h-4 w-4 text-zinc-500 dark:text-zinc-400';

  @property()
  detailsEditorClass: string = 'ml-4 border-l dark:border-zinc-200 pl-4 relative';

  @property()
  plusIconClass: string = 'size-6 float-right text-green-600 dark:text-green-400 cursor-pointer hover:text-green-700 dark:hover:text-green-500';

  @property()
  xIconClass: string = 'size-5 -mr-1 mt-4 cursor-pointer text-zinc-900 dark:text-zinc-50';

  @property()
  groupClass: string = 'md:flex md:gap-x-4 md:flex-wrap';

  @property()
  groupLabelClass: string = 'font-bold md:basis-full dark:text-zinc-50 text-zinc-800';

  @property()
  groupElementClass: string = 'md:flex-1';

  @property()
  alternativePathDescriptionClass: string = 'text-xs italic text-zinc-500 dark:text-zinc-200 mb-2 -mt-1 hover:text-zinc-700 dark:hover:text-zinc-100 cursor-pointer';

  @property()
  alternativePathSelectClass: string = 'absolute z-50 bg-white dark:bg-zinc-800 border dark:border-zinc-600 rounded shadow-md -mt-t';

  @property()
  alternativePathOptionClass: string = 'px-2 py-1 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-700 cursor-pointer';

  @property()
  alternativePathOptionSelectedClass: string = 'font-bold';

  @property()
  selectWidgetIconClass: string = 'size-6 cursor-pointer text-zinc-500 dark:text-zinc-200 hover:text-zinc-700 dark:hover:text-zinc-100';

  @property()
  selectWidgetDropdownClass: string = 'absolute right-0 mt-2 origin-top-right transform translate-x-0 z-50 min-w-64 bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-600 rounded-md shadow-lg max-h-80 w-md overflow-auto max-w-[85vw]';

  @property()
  selectWidgetOptionClass: string = 'px-4 py-2 cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-700';

  @property()
  selectWidgetOptionSelectedClass: string = 'bg-zinc-100 dark:bg-zinc-700';

  @property()
  selectWidgetLabelClass: string = 'font-medium text-zinc-800 dark:text-zinc-200';

  @property()
  selectWidgetDescriptionClass: string = 'text-sm text-zinc-500 dark:text-zinc-400';

  @property()
  selectWidgetScoreClass: string = 'text-xs text-zinc-400 dark:text-zinc-500 ml-3';

  @property()
  subClassEditorClass: string = 'relative';

  @property()
  subClassEditorDropdownClass: string = 'absolute z-50 w-full bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-600 rounded-md shadow-lg mt-1 max-h-60 overflow-auto';

  @property()
  subClassEditorOptionClass: string = 'px-3 py-2 cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-700';

  @property()
  subClassEditorOptionSelectedClass: string = 'bg-zinc-100 dark:bg-zinc-700';

  @property()
  subClassEditorLabelClass: string = 'font-medium';

  @property()
  subClassEditorDescriptionClass: string = 'text-sm text-zinc-500 dark:text-zinc-400';

  @property()
  detailsClassSelectClass: string = 'relative';

  @property()
  detailsClassSelectDropdownClass: string = 'absolute z-50 w-full bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-600 rounded-md shadow-lg mt-1 max-h-60 overflow-auto';

  @property()
  detailsClassSelectOptionClass: string = 'px-3 py-2 cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-700';

  @property()
  detailsClassSelectOptionSelectedClass: string = 'bg-zinc-100 dark:bg-zinc-700';

  @property()
  detailsClassSelectLabelClass: string = 'font-medium';

  @property()
  detailsClassSelectDescriptionClass: string = 'text-sm text-zinc-500 dark:text-zinc-400';

  @property()
  instancesSelectEditorClass: string = 'relative min-h-9';

  @property()
  instancesSelectEditorIconClass: string = 'size-4 text-zinc-500 dark:text-zinc-400';

  @property()
  instancesSelectEditorDropdownClass: string = 'absolute z-50 w-full bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-600 rounded-md shadow-lg mt-1 max-h-60 overflow-auto';

  @property()
  instancesSelectEditorOptionClass: string = 'px-3 py-2 cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-700';

  @property()
  instancesSelectEditorOptionSelectedClass: string = 'bg-zinc-100 dark:bg-zinc-700';

  @property()
  instancesSelectEditorLabelClass: string = 'font-medium';

  @property()
  instancesSelectEditorDescriptionClass: string = 'text-sm text-zinc-500 dark:text-zinc-400';

  @property()
  richTextEditorClass: string = 'border dark:border-zinc-600 rounded-md shadow-sm';

  @property()
  richTextEditorToolbarClass: string = 'flex flex-wrap gap-1 border-b dark:border-zinc-600 rounded-t-md bg-zinc-50 dark:bg-zinc-800 p-2 pr-8';

  @property()
  richTextEditorButtonClass: string = 'px-2 py-1 text-sm hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded cursor-pointer justify-center flex items-center';

  @property()
  richTextEditorSelectClass: string = 'text-sm border dark:border-zinc-600 rounded px-1 cursor-pointer';

  @property()
  richTextEditorContentClass: string = 'min-h-50 p-3 focus:outline-none prose max-w-none';

  @property()
  richTextEditorRawContentClass: string = 'w-full min-h-50 p-2 focus:outline-none';

  @state()
  ui: UIComponent[] = [];

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

  createRenderRoot() {
    return this.useLightDom ? this : super.createRenderRoot();
  }

  render() {
    const tailwindClasses: TailwindClasses = {
      componentClass: this.componentClass,
      spinnerClass: this.spinnerClass,
      labelClass: this.labelClass,
      descriptionClass: this.descriptionClass,
      globalFieldClass: this.globalFieldClass,
      globalInputFieldClass: this.globalInputFieldClass,
      autoCompleteEditorClass: this.autoCompleteEditorClass,
      autoCompleteEditorDropdownClass: this.autoCompleteEditorDropdownClass,
      autoCompleteEditorOptionClass: this.autoCompleteEditorOptionClass,
      autoCompleteEditorLabelClass: this.autoCompleteEditorLabelClass,
      autoCompleteEditorDescriptionClass: this.autoCompleteEditorDescriptionClass,
      blankNodeEditorClass: this.blankNodeEditorClass,
      textFieldEditorClass: this.textFieldEditorClass,
      textAreaEditorClass: this.textAreaEditorClass,
      numberFieldEditorClass: this.numberFieldEditorClass,
      booleanEditorClass: this.booleanEditorClass,
      booleanEditorLabelClass: this.booleanEditorLabelClass,
      datePickerEditorClass: this.datePickerEditorClass,
      dateTimePickerEditorClass: this.dateTimePickerEditorClass,
      enumSelectEditorClass: this.enumSelectEditorClass,
      enumSelectEditorIconClass: this.enumSelectEditorIconClass,
      plusIconClass: this.plusIconClass,
      xIconClass: this.xIconClass,
      detailsEditorClass: this.detailsEditorClass,
      groupClass: this.groupClass,
      groupLabelClass: this.groupLabelClass,
      groupElementClass: this.groupElementClass,
      alternativePathDescriptionClass: this.alternativePathDescriptionClass,
      alternativePathSelectClass: this.alternativePathSelectClass,
      alternativePathOptionClass: this.alternativePathOptionClass,
      alternativePathOptionSelectedClass: this.alternativePathOptionSelectedClass,
      selectWidgetIconClass: this.selectWidgetIconClass,
      selectWidgetDropdownClass: this.selectWidgetDropdownClass,
      selectWidgetOptionClass: this.selectWidgetOptionClass,
      selectWidgetOptionSelectedClass: this.selectWidgetOptionSelectedClass,
      selectWidgetLabelClass: this.selectWidgetLabelClass,
      selectWidgetDescriptionClass: this.selectWidgetDescriptionClass,
      selectWidgetScoreClass: this.selectWidgetScoreClass,
      subClassEditorClass: this.subClassEditorClass,
      subClassEditorDropdownClass: this.subClassEditorDropdownClass,
      subClassEditorOptionClass: this.subClassEditorOptionClass,
      subClassEditorOptionSelectedClass: this.subClassEditorOptionSelectedClass,
      subClassEditorLabelClass: this.subClassEditorLabelClass,
      subClassEditorDescriptionClass: this.subClassEditorDescriptionClass,
      detailsClassSelectClass: this.detailsClassSelectClass,
      detailsClassSelectDropdownClass: this.detailsClassSelectDropdownClass,
      detailsClassSelectOptionClass: this.detailsClassSelectOptionClass,
      detailsClassSelectOptionSelectedClass: this.detailsClassSelectOptionSelectedClass,
      detailsClassSelectLabelClass: this.detailsClassSelectLabelClass,
      detailsClassSelectDescriptionClass: this.detailsClassSelectDescriptionClass,
      instancesSelectEditorClass: this.instancesSelectEditorClass,
      instancesSelectEditorIconClass: this.instancesSelectEditorIconClass,
      instancesSelectEditorDropdownClass: this.instancesSelectEditorDropdownClass,
      instancesSelectEditorOptionClass: this.instancesSelectEditorOptionClass,
      instancesSelectEditorOptionSelectedClass: this.instancesSelectEditorOptionSelectedClass,
      instancesSelectEditorLabelClass: this.instancesSelectEditorLabelClass,
      instancesSelectEditorDescriptionClass: this.instancesSelectEditorDescriptionClass,
      richTextEditorClass: this.richTextEditorClass,
      richTextEditorToolbarClass: this.richTextEditorToolbarClass,
      richTextEditorButtonClass: this.richTextEditorButtonClass,
      richTextEditorSelectClass: this.richTextEditorSelectClass,
      richTextEditorContentClass: this.richTextEditorContentClass,
      richTextEditorRawContentClass: this.richTextEditorRawContentClass
    }
    const renderer = this;
    return html`
      <div class="${this.componentClass}">
        ${this.loading
           ? html`
             <div class="flex items-center justify-center py-10">
               <div
                  class="${this.spinnerClass}">
               </div>
             </div>
           `
           : html`
             ${renderUIComponents(renderer, this.ui, tailwindClasses)}
           `}
      </div>
    `;
  }

  rerender() {
    this.ui = [...this.ui];
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
    } else {
      return outputQuads;
    }
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
    if ((changedProperties.has('dataGraph') || changedProperties.has('dataGraphContentType')) && this.dataGraph && this.dataGraph.trim().length !== 0 && this.dataGraphContentType && this.dataGraphContentType.trim().length !== 0) {
      this.loading = true;
      console.log('dataGraph changed to', this.dataGraph)
      this.dataStore = await parseRdf(this.dataGraph, this.dataGraphContentType);
      reconstructUi = true;
    }
    if (changedProperties.has('dataGraphUrl') && this.dataGraphUrl && this.dataGraphUrl.trim().length !== 0) {
      this.loading = true;
      console.log('dataGraphUrl changed to', this.dataGraphUrl)
      this.dataStore = await dereferenceRdf(new URL(this.dataGraphUrl, window.location.href).href);
      reconstructUi = true;
    }
    if (changedProperties.has('shapesGraph') || changedProperties.has('shapesGraphContentType')) {
      this.loading = true;
      console.log('shapesGraph changed to', this.shapesGraph)
      this.shapesStore = await parseRdf(this.shapesGraph, this.shapesGraphContentType);
      console.log('Constructed UI:', this.ui);
      reconstructUi = true;
    }
    if (changedProperties.has('shapesGraphUrl') && this.shapesGraphUrl && this.shapesGraphUrl.trim().length !== 0) {
      this.loading = true;
      console.log('shapesGraphUrl changed to', this.shapesGraphUrl)
      this.shapesStore = await dereferenceRdf(new URL(this.shapesGraphUrl, window.location.href).href);
      reconstructUi = true;
    }
    if (changedProperties.has('widgetScoringGraph') || changedProperties.has('widgetScoringGraphContentType')) {
      this.loading = true;
      console.log('widgetScoringGraph changed to', this.widgetScoringGraph)
      this.widgetScoringStore = await parseRdf(this.widgetScoringGraph, this.widgetScoringGraphContentType);
      reconstructUi = true;
    }
    if (changedProperties.has('widgetScoringGraphUrl') && this.widgetScoringGraphUrl && this.widgetScoringGraphUrl.trim().length !== 0) {
      this.loading = true;
      console.log('widgetScoringGraphUrl changed to', this.widgetScoringGraphUrl)
      this.widgetScoringStore = await dereferenceRdf(new URL(this.widgetScoringGraphUrl, window.location.href).href);
      reconstructUi = true;
    }
    if (reconstructUi && this.shapesStore && this.focusNode && this.focusNode.trim().length !== 0 && this.dataStore && this.widgetScoringStore && this.constraintShape && this.constraintShape.trim().length !== 0) {
      this.ui = await Promise.all(await constructUiComponents(this, this.shapesStore, df.namedNode(this.constraintShape), this.dataStore, this.focusNode ? df.namedNode(this.focusNode) : undefined, this.widgetScoringStore));
      this.loading = false;
    }
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'shacl-renderer': ShaclRenderer
  }
}
