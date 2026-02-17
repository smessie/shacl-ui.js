import {html, LitElement, type PropertyValues} from 'lit'
import {customElement, property, state} from 'lit/decorators.js'
import {TW} from "./shared/tailwindMixin";
import type {RdfStore} from "rdf-stores";
import {dereferenceRdf, parseRdf, serializeRdf} from "./utils/rdf.ts";
import {constructUiComponents, uiComponentsToQuads} from "./utils/ui.ts";
import {renderUIComponents} from "./utils/widgets.ts";
import type {TailwindClasses, UIComponent} from "./utils/types.ts";
import * as RDF from "rdf-js";
import {type Quad} from "rdf-js";
import {DataFactory} from "rdf-data-factory";

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

  @property({type: Boolean})
  useLightDom: boolean = false;

  @property()
  dataGraph: string = '';

  @property()
  dataGraphContentType: string = '';

  @property()
  dataGraphUrl: string = '';

  @property()
  dataStore: RdfStore | null = null;

  @property()
  shapesGraph: string = '';

  @property()
  shapesGraphContentType: string = '';

  @property()
  shapesGraphUrl: string = '';

  @property()
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
  labelClass: string = 'block text-gray-700 text-sm font-bold mb-2';

  @property()
  descriptionClass: string = 'mt-1 text-xs text-gray-500';

  @property()
  globalFieldClass: string = 'text-gray-700 leading-tight mb-2';

  @property()
  globalInputFieldClass: string = 'w-full shadow appearance-none border rounded py-2 px-3 pr-8 focus:outline-none focus:shadow-outline focus:border-gray-400';

  @property()
  autoCompleteEditorClass: string = 'relative';

  @property()
  autoCompleteEditorDropdownClass: string = 'absolute z-50 w-full bg-white border border-gray-300 rounded-md shadow-lg mt-1 max-h-60 overflow-auto';

  @property()
  autoCompleteEditorOptionClass: string = 'px-3 py-2 cursor-pointer hover:bg-gray-100';

  @property()
  autoCompleteEditorLabelClass: string = 'font-medium';

  @property()
  autoCompleteEditorDescriptionClass: string = 'text-sm text-gray-500';

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
  enumSelectEditorIconClass: string = 'h-4 w-4 text-gray-500';

  @property()
  detailsEditorClass: string = 'ml-4 border-l pl-4 relative';

  @property()
  plusIconClass: string = 'size-6 float-right text-green-600';

  @property()
  xIconClass: string = 'size-5 -mr-1 mt-4';

  @property()
  groupClass: string = 'md:flex md:gap-x-4 md:flex-wrap';

  @property()
  groupLabelClass: string = 'font-bold md:basis-full';

  @property()
  groupElementClass: string = 'md:flex-1';

  @state()
  ui: UIComponent[] = [];

  @state()
  autoCompleteEditorOpen: Record<string, boolean> = {};

  @state()
  autoCompleteEditorFilter: Record<string, string> = {};

  createRenderRoot() {
    return this.useLightDom ? this : super.createRenderRoot();
  }

  render() {
    const tailwindClasses: TailwindClasses = {
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
    }
    const renderer = this;
    return html`
      <div>
        ${renderUIComponents(renderer, this.ui, tailwindClasses)}
      </div>
    `
  }

  rerender() {
    this.ui = [...this.ui];
  }

  /**
   * Retrieves the current data graph entered by the user in the form as a string in the specified content type.
   * If contentType is not provided, returns the data graph as an array of RDF quads.
   * @param contentType
   * @returns {Promise<string | Quad[]>} The current data graph as a string in the specified content type, or as a array of quads if no content type is provided.
   */
  async data(contentType?: string): Promise<string | Quad[]> {
    const outputQuads = uiComponentsToQuads(this.ui);
    if (contentType) {
      return await serializeRdf(outputQuads, contentType);
    } else {
      return outputQuads;
    }
  }

  protected async willUpdate(changedProperties: PropertyValues) {
    let reconstructUi = false;
    if ((changedProperties.has('dataGraph') || changedProperties.has('dataGraphContentType')) && this.dataGraph && this.dataGraph.trim().length !== 0 && this.dataGraphContentType && this.dataGraphContentType.trim().length !== 0) {
      console.log('dataGraph changed to', this.dataGraph)
      this.dataStore = await parseRdf(this.dataGraph, this.dataGraphContentType);
      reconstructUi = true;
    }
    if (changedProperties.has('dataGraphUrl') && this.dataGraphUrl && this.dataGraphUrl.trim().length !== 0) {
      console.log('dataGraphUrl changed to', this.dataGraphUrl)
      this.dataStore = await dereferenceRdf(new URL(this.dataGraphUrl, window.location.href).href);
      reconstructUi = true;
    }
    if (changedProperties.has('shapesGraph') || changedProperties.has('shapesGraphContentType')) {
      console.log('shapesGraph changed to', this.shapesGraph)
      this.shapesStore = await parseRdf(this.shapesGraph, this.shapesGraphContentType);
      console.log('Constructed UI:', this.ui);
      reconstructUi = true;
    }
    if (changedProperties.has('shapesGraphUrl') && this.shapesGraphUrl && this.shapesGraphUrl.trim().length !== 0) {
      console.log('shapesGraphUrl changed to', this.shapesGraphUrl)
      this.shapesStore = await dereferenceRdf(new URL(this.shapesGraphUrl, window.location.href).href);
      reconstructUi = true;
    }
    if (changedProperties.has('widgetScoringGraph') || changedProperties.has('widgetScoringGraphContentType')) {
      console.log('widgetScoringGraph changed to', this.widgetScoringGraph)
      this.widgetScoringStore = await parseRdf(this.widgetScoringGraph, this.widgetScoringGraphContentType);
      reconstructUi = true;
    }
    if (changedProperties.has('widgetScoringGraphUrl') && this.widgetScoringGraphUrl && this.widgetScoringGraphUrl.trim().length !== 0) {
      console.log('widgetScoringGraphUrl changed to', this.widgetScoringGraphUrl)
      this.widgetScoringStore = await dereferenceRdf(new URL(this.widgetScoringGraphUrl, window.location.href).href);
      reconstructUi = true;
    }
    if (reconstructUi && this.shapesStore && this.focusNode && this.focusNode.trim().length !== 0 && this.dataStore && this.widgetScoringStore && this.constraintShape && this.constraintShape.trim().length !== 0) {
      this.ui = await Promise.all(await constructUiComponents(this.shapesStore, this.constraintShape, this.dataStore, this.focusNode ? df.namedNode(this.focusNode) : undefined, this.widgetScoringStore));
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
}

declare global {
  interface HTMLElementTagNameMap {
    'shacl-renderer': ShaclRenderer
  }
}
