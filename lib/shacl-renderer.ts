// Must run before readable-stream (via rdf-parse / string-to-stream) is evaluated.
import "./core/ensure-process.ts";
import {css, html, LitElement, type PropertyValues, unsafeCSS} from 'lit'
import {customElement, property, state} from 'lit/decorators.js'
import {TW} from "./shared/tailwind-mixin";
import type {RdfStore} from "rdf-stores";
import {dereferenceRdf, parseRdf, serializeRdf} from "./core/rdf.ts";
import {constructUiComponents} from "./core/ui-model.ts";
import {cloneUiComponent} from "./core/clone.ts";
import {rdf, xsd} from "./core/namespaces.ts";
import {type LabelResolutionConfig, resolvePreferredLanguages} from "./core/labels.ts";
import {renderRootSlots, addChildrenToDataStore} from "./presentation/widgets.ts";
import type {Path, RootOrGroup, RootRenderSlot, TailwindClasses, UIComponent, UIComponentValue} from "./types.ts";
import {STYLING_SLOT_NAMES, STYLING_SLOTS} from "./styling-slots.ts";
import type {Term} from "@rdfjs/types";
import * as RDF from "@rdfjs/types";
import {type Quad, type Quad_Object, type Quad_Subject} from "@rdfjs/types";
import {DataFactory} from "rdf-data-factory";
import tailwindStyles from './styles/tailwind.global.css?inline';
import './styles/tailwind.global.css';
import {twMerge} from 'tailwind-merge';

// Re-export the scoring function.
export {score, matcherFunction, acceptFunction, scoreFunction, selectWidget, validationFunction} from "./core/score.ts";

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
  static readonly DEFAULTS: Required<TailwindClasses> = STYLING_SLOTS;

  // Reactive string property (and lowercased attribute) for every styling slot, derived
  // from STYLING_SLOTS so the slot list lives in exactly one place.
  static properties = Object.fromEntries(
    STYLING_SLOT_NAMES.map(name => [name, {type: String}]),
  );

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

  /**
   * Rendering mode. In `'edit'` (default) each value is rendered with its selected editor widget
   * and full editing affordances. In `'view'` each value is rendered read-only with its selected
   * viewer widget (see the SHACL-UI viewers spec).
   */
  @property({ reflect: true })
  mode: 'edit' | 'view' = 'edit';

  @property({type: Boolean})
  dereferenceForLabelResolution: boolean = false;

  /**
   * Application-level preferred languages for Label and Language Resolution, as a comma-separated
   * list in priority order (e.g. `"fr,en"`). Earlier entries are preferred. When left empty, the
   * browser's `navigator.languages` is used as the default. `sh:languageIn` in the shapes graph
   * still takes precedence over this value.
   */
  @property()
  languages: string = '';

  /**
   * Optional override for the value-node label predicates, as a comma-separated list of predicate
   * IRIs in priority order. When empty, the built-in default set is used
   * (`rdfs:label`, `dcterms:title`, `skos:prefLabel`, `schema:name`).
   */
  @property()
  labelPredicates: string = '';

  /**
   * Cached {@link LabelResolutionConfig}. The getter below is called in hot loops (per property,
   * per instance, per or-option render), so the config is computed once and invalidated in
   * willUpdate when one of its source properties changes.
   */
  private cachedLabelConfig: LabelResolutionConfig | null = null;

  /**
   * Resolves the {@link LabelResolutionConfig} used by label/description/language resolution from
   * the current renderer configuration (preferred languages, optional predicate override, and the
   * dereferencing fallback flag).
   */
  get labelConfig(): LabelResolutionConfig {
    if (this.cachedLabelConfig) {
      return this.cachedLabelConfig;
    }
    const config: LabelResolutionConfig = {
      preferredLanguages: resolvePreferredLanguages(this.languages),
      dereferenceForLabelResolution: this.dereferenceForLabelResolution,
    };
    const predicates = this.labelPredicates.split(",").map(p => p.trim()).filter(p => p.length > 0);
    if (predicates.length > 0) {
      config.labelPredicates = predicates;
    }
    this.cachedLabelConfig = config;
    return config;
  }

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
  // Each slot is a reactive string property generated from STYLING_SLOTS via the
  // `static properties` block above (so the slot list lives in exactly one place).
  // In render() each slot is resolved as twMerge(DEFAULTS[slot], this[slot]) so the
  // user's value layers on top of the built-in default.

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

  /** Current page index (0-based) for each ValueTableViewer, keyed by component uuid. */
  @state()
  valueTablePage: Record<string, number> = {};

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
    return twMerge(ShaclRenderer.DEFAULTS[key], (this as unknown as Record<string, string>)[key]);
  }

  /**
   * Cached merged styling classes. Computing all ~70 twMerge slots is pure with respect to
   * the styling properties, so it is memoized here and only recomputed when one of those
   * properties changes (see willUpdate), instead of on every render.
   */
  private mergedClasses: TailwindClasses | null = null;

  private computeMergedClasses(): TailwindClasses {
    return Object.fromEntries(
      STYLING_SLOT_NAMES.map(name => [name, this.m(name)]),
    ) as TailwindClasses;
  }

  render() {
    const tailwindClasses = this.mergedClasses ??= this.computeMergedClasses();
    const renderer = this;
    return html`
      <div class="${tailwindClasses.componentClass}">
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
                  class="${tailwindClasses.spinnerClass}">
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
    // When switching to a different option, purge the previously-selected
    // option's data from the data graph so only the currently selected option's
    // values remain. Locate the still-current orSection render slot for this
    // group and remove each of its components' values (and nested children).
    const currentIndex = this.rootOrGroups[groupIndex]?.selectedIndex;
    if (currentIndex !== undefined && currentIndex !== optionIndex) {
      const slot = this.renderSlots.find(
        (s): s is Extract<RootRenderSlot, {kind: 'orSection'}> =>
          s.kind === 'orSection' && s.groupIndex === groupIndex,
      );
      if (slot) this.removeComponentsData(slot.section.components);
    }

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
    const outputQuads = this.dataStore?.getQuads() ?? [];
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

  setValueTablePage(key: string, value: number) {
    this.valueTablePage = {
      ...this.valueTablePage,
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
      // Remove synchronously via getQuads + removeQuad. RdfStore.removeMatches is stream-based
      // and only removes on later microtasks, while every caller (editor change handlers,
      // selectValueOrOption, data()) relies on the quad being gone immediately.
      if (path.type === "predicate") {
        for (const quad of this.dataStore.getQuads(focusNode, pathTerm, value)) {
          this.dataStore.removeQuad(quad);
        }
      } else if (path.type === "inverse") {
        for (const quad of this.dataStore.getQuads(value, pathTerm, focusNode)) {
          this.dataStore.removeQuad(quad);
        }
      } else {
        console.warn(`Unsupported path type for removal: ${path.type}`);
      }
    } else {
      console.warn('Cannot remove from data store: missing dataStore, focusNode, path, or value');
    }
  }

  /**
   * Removes from the data store all values (and nested child subtrees) contributed
   * by the given UIComponents. Used when switching a sh:or option so the
   * deselected option's data no longer appears in the data graph.
   */
  removeComponentsData(components: UIComponent[]) {
    for (const component of components) {
      for (const [index, value] of component.values.entries()) {
        this.removeFromDataStore(component.focusNode, value.path, value.value, component.children?.[index]);
      }
    }
  }

  /**
   * Switches the nested `sh:or` option for a single value of a property whose
   * `sh:or` unions `sh:node`, `sh:datatype`, or `sh:class` constraints. The
   * previously-selected option's data is removed from the data graph and the
   * newly-selected option's default data is materialized, so only the currently
   * selected option's value remains in the data graph.
   */
  selectValueOrOption(uiComponent: UIComponent, value: UIComponentValue, valueIndex: number, index: number) {
    if (value.selectedOrIndex === index) return;

    if (uiComponent.orNode && uiComponent.orNode[index]) {
      // Keep the value's node link; swap its nested children. Purge the
      // previously-selected node option's nested data, then seed the newly
      // selected option's default children into the data graph.
      this.removeComponentsData(uiComponent.children?.[valueIndex] ?? []);
      const orOption = uiComponent.orNode[index];
      const newChildren = (orOption.defaultChild ?? []).map(child => {
        const cloned = cloneUiComponent(child);
        cloned.focusNode = value.value;
        return cloned;
      });
      if (!uiComponent.children) uiComponent.children = [];
      uiComponent.children[valueIndex] = newChildren;
      addChildrenToDataStore(this, newChildren);
    } else if (uiComponent.orDatatype && uiComponent.orDatatype[index]) {
      // The literal value itself encodes the datatype option: remove the old
      // literal and seed a fresh empty literal of the newly selected datatype.
      this.removeFromDataStore(uiComponent.focusNode, value.path, value.value);
      // Note: uiComponent.datatype is deliberately left untouched — the or-selection is
      // per-value, and the new literal's own datatype carries it (see getDataType).
      const datatype = uiComponent.orDatatype[index].datatype;
      const newValue = df.literal('', df.namedNode(datatype ?? xsd('string')));
      value.value = newValue;
      this.addToDataStore(uiComponent.focusNode, value.path, newValue);
    } else if (uiComponent.orClass && uiComponent.orClass[index]) {
      // The typed node value encodes the class option: remove the old node (and
      // its nested subtree), then seed a fresh node typed with the new class.
      this.removeFromDataStore(uiComponent.focusNode, value.path, value.value, uiComponent.children?.[valueIndex]);
      const option = uiComponent.orClass[index];
      const newNode = this.preferSkolemizedBlankNodes
        ? df.namedNode(`urn:uuid:${crypto.randomUUID()}`)
        : df.blankNode();
      value.value = newNode;
      const newChildren = (option.classValue.children ?? []).map(child => {
        const cloned = cloneUiComponent(child);
        cloned.focusNode = newNode;
        return cloned;
      });
      if (!uiComponent.children) uiComponent.children = [];
      uiComponent.children[valueIndex] = newChildren;
      this.addToDataStore(uiComponent.focusNode, value.path, newNode);
      this.addToDataStore(newNode, {path: rdf('type'), type: 'predicate'}, option.class);
      addChildrenToDataStore(this, newChildren);
    }

    value.selectedOrIndex = index;
    this.rerender();
  }

  protected async willUpdate(changedProperties: PropertyValues) {
    // Invalidate the memoized styling classes when any styling slot changed.
    if (this.mergedClasses && (Object.keys(ShaclRenderer.DEFAULTS) as (keyof TailwindClasses)[]).some(key => changedProperties.has(key))) {
      this.mergedClasses = null;
    }

    // Invalidate the memoized label config when one of its source properties changed.
    if (changedProperties.has('languages') || changedProperties.has('labelPredicates') || changedProperties.has('dereferenceForLabelResolution')) {
      this.cachedLabelConfig = null;
    }

    let reconstructUi = false;
    // Switching between edit and view mode changes which widget (editor vs viewer) each value uses,
    // so the UI model must be rebuilt. Only rebuild when the graphs are already loaded (the guard
    // below); the initial construction is driven by the graph changes.
    if (changedProperties.has('mode') && this.shapesStore && this.dataStore && this.widgetScoringStore) {
      reconstructUi = true;
    }
    // Changing the focus node or constraint shape re-targets the form, so rebuild too (the
    // initial construction is driven by the graph changes below, hence the loaded-stores guard).
    if ((changedProperties.has('focusNode') || changedProperties.has('constraintShape')) && this.shapesStore && this.dataStore && this.widgetScoringStore) {
      reconstructUi = true;
    }
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
      if (reconstructUi) {
        if (this.shapesStore && this.focusNode && this.focusNode.trim().length !== 0 && this.dataStore && this.widgetScoringStore && this.constraintShape && this.constraintShape.trim().length !== 0) {
          const result = await constructUiComponents(this, this.shapesStore, df.namedNode(this.constraintShape), this.dataStore, this.focusNode ? df.namedNode(this.focusNode) : undefined, this.widgetScoringStore);
          this.ui = result.components;
          this.renderSlots = result.renderSlots;
          this.rootOrGroups = result.rootOrGroups;
          this.error = null;
          this.loading = false;
        } else {
          // Inputs changed but the UI cannot be constructed: report which required input is
          // missing instead of spinning forever.
          const missing: string[] = [];
          if (!this.dataStore) missing.push('data graph');
          if (!this.shapesStore) missing.push('shapes graph');
          if (!this.widgetScoringStore) missing.push('widget scoring graph');
          if (!this.focusNode || this.focusNode.trim().length === 0) missing.push('focusNode');
          if (!this.constraintShape || this.constraintShape.trim().length === 0) missing.push('constraintShape');
          this.error = `Cannot render the form: missing required input(s): ${missing.join(', ')}.`;
          this.loading = false;
        }
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
