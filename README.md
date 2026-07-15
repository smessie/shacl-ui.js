# shacl-ui.js

A framework-agnostic Web Component library that renders interactive RDF data-entry forms driven by [SHACL](https://www.w3.org/TR/shacl/) shapes.  
Give it a data graph, a shapes graph, and a widget-scoring graph; it builds a fully functional form that reads, edits, and returns the underlying RDF data.

`shacl-ui.js` is an implementation of the [SHACL 1.2 User Interfaces (SHACL-UI)](https://w3c.github.io/data-shapes/shacl12-ui/) specification.

> [!WARNING]
> This library is still in heavy development, and so is the SHACL 1.2 UI specification itself. Expect breaking changes to both until the 1.0 release.

---

## Table of Contents

- [How it works](#how-it-works)
- [Installation](#installation)
- [Usage](#usage)
  - [Plain HTML](#plain-html)
  - [Vue 3](#vue-3)
- [Attributes & Properties](#attributes--properties)
- [Retrieving edited data](#retrieving-edited-data)
- [Collection rendering](#collection-rendering)
- [Widget scoring](#widget-scoring)
- [Available widgets](#available-widgets)
- [Styling & Tailwind CSS classes](#styling--tailwind-css-classes)
- [Contributing](#contributing)

---

## How it works

`shacl-ui.js` exposes a single custom element, `<shacl-renderer>`, built with [Lit](https://lit.dev/).

When the element is initialized it:

1. **Parses or fetches** the three RDF graphs it needs:
   - **Data graph** – the RDF resource(s) being edited (e.g. a Person instance).
   - **Shapes graph** – the SHACL shapes that constrain those resources (`sh:NodeShape` / `sh:PropertyShape`).
   - **Widget-scoring graph** – a set of `shui:WidgetScore` instances that decide which editor widget is best for each property value (see [Widget scoring](#widget-scoring)).

2. **Selects a focus node** (`focusNode`) and a **constraint shape** (`constraintShape`) inside the shapes graph.

3. **Walks the property shapes** of the constraint shape and, for every property, evaluates every candidate widget against both the current data value and the shapes graph constraints. The widget with the highest score wins.

4. **Renders the form** using the winning widgets. Changes are immediately reflected in an internal RDF store; calling `element.data(contentType?)` serialises the result back to any supported RDF content type.

---

## Installation

```bash
npm install shacl-ui
```

The library is a standard Web Component built with Lit. No separate stylesheet needs to be imported – the Tailwind CSS styles are bundled directly into the JavaScript module via Shadow DOM injection.

> **Tip:** See the working examples in the [`src/`](src/) directory of this repository for a variety of HTML pages that import and use the library in different configurations.

---

## Usage

Because `<shacl-renderer>` is a standard [Web Component](https://developer.mozilla.org/en-US/docs/Web/API/Web_components), it works in **any web framework – or with no framework at all**. The two examples below (plain HTML and Vue 3) are just demonstrations of the concept. For guidance on integrating Lit-based Web Components with other frameworks (React, Angular, Svelte, …), see the [Lit documentation on using Web Components in any project](https://lit.dev/docs/tools/adding-lit/#use-your-component).

### Plain HTML

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <script type="module" src="https://unpkg.com/shacl-ui/dist/shacl-renderer.js"></script>
  </head>
  <body>
    <form id="shacl-form">
      <shacl-renderer
        id="renderer"
        dataGraphUrl="/data/person.ttl"
        shapesGraphUrl="/shapes/person-shape.ttl"
        widgetScoringGraphUrl="/scoring/widget-scoring.ttl"
        focusNode="http://example.org/alice"
        constraintShape="http://example.org/PersonShape"
      ></shacl-renderer>

      <button type="submit">Save</button>
    </form>

    <script type="module">
      const form = document.getElementById('shacl-form');
      const renderer = document.getElementById('renderer');

      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        // Retrieve the edited graph as Turtle
        const turtle = await renderer.data('text/turtle');
        console.log(turtle);
      });
    </script>
  </body>
</html>
```

You can also supply raw RDF strings instead of URLs:

```html
<shacl-renderer
  dataGraph="@prefix foaf: <http://xmlns.com/foaf/0.1/> . <http://example.org/alice> foaf:name 'Alice' ."
  dataGraphContentType="text/turtle"
  shapesGraph="..."
  shapesGraphContentType="text/turtle"
  widgetScoringGraph="..."
  widgetScoringGraphContentType="text/turtle"
  focusNode="http://example.org/alice"
  constraintShape="http://example.org/PersonShape"
></shacl-renderer>
```

---

### Vue 3

Install the package and tell Vue to treat `<shacl-renderer>` as a custom element so it is not treated as a Vue component:

```ts
// vite.config.ts (or vue.config.js)
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [
    vue({
      template: {
        compilerOptions: {
          // Treat any element starting with "shacl-" as a custom element
          isCustomElement: (tag) => tag.startsWith('shacl-'),
        },
      },
    }),
  ],
});
```

Register the element once in your application entry point:

```ts
// main.ts
import { createApp } from 'vue';
import App from './App.vue';
import 'shacl-ui'; // registers <shacl-renderer>

createApp(App).mount('#app');
```

Use it inside any component:

```vue
<script setup lang="ts">
import { ref } from 'vue';

const rendererRef = ref<HTMLElement | null>(null);

async function save() {
  const turtle = await (rendererRef.value as any).data('text/turtle');
  console.log(turtle);
}
</script>

<template>
  <form @submit.prevent="save">
    <shacl-renderer
      ref="rendererRef"
      dataGraphUrl="/data/person.ttl"
      shapesGraphUrl="/shapes/person-shape.ttl"
      widgetScoringGraphUrl="/scoring/widget-scoring.ttl"
      focusNode="http://example.org/alice"
      constraintShape="http://example.org/PersonShape"
    />
    <button type="submit">Save</button>
  </form>
</template>
```

---

## Attributes & Properties

| Attribute / Property            | Type                | Description                                                                                            |
|---------------------------------|---------------------|--------------------------------------------------------------------------------------------------------|
| `dataGraph`                     | `string`            | Raw RDF string for the data graph.                                                                     |
| `dataGraphContentType`          | `string`            | Content type of `dataGraph` (e.g. `text/turtle`).                                                      |
| `dataGraphUrl`                  | `string`            | URL to dereference for the data graph.                                                                 |
| `shapesGraph`                   | `string`            | Raw RDF string for the shapes graph.                                                                   |
| `shapesGraphContentType`        | `string`            | Content type of `shapesGraph`.                                                                         |
| `shapesGraphUrl`                | `string`            | URL to dereference for the shapes graph.                                                               |
| `widgetScoringGraph`            | `string`            | Raw RDF string for the widget-scoring graph.                                                           |
| `widgetScoringGraphContentType` | `string`            | Content type of `widgetScoringGraph`.                                                                  |
| `widgetScoringGraphUrl`         | `string`            | URL to dereference for the widget-scoring graph.                                                       |
| `focusNode`                     | `string`            | IRI of the RDF node being edited. Omit it to render the shape's whole [target set as a collection](#collection-rendering). |
| `constraintShape`               | `string`            | IRI of the `sh:NodeShape` to use as the root constraint.                                               |
| `focusNodeMode`                 | `'list' \| 'picker'`| Presentation when rendering a [collection](#collection-rendering) (i.e. `focusNode` is omitted). Unset shows a picker with an "All items" option; `list` stacks every item without a picker; `picker` shows a picker without "All items" and renders one item. |
| `mode`                          | `'edit' \| 'view'`  | Render editable editor widgets (`edit`, default) or read-only viewer widgets (`view`).                 |
| `theme`                         | `'light' \| 'dark'` | Colour theme. Defaults to the OS preference.                                                           |
| `useLightDom`                   | `boolean`           | Render into the light DOM instead of a Shadow DOM (useful when you want your own CSS to apply).        |
| `expandPrefixes`                | `boolean`           | Auto-expand prefixed IRIs entered in IRI fields (default: `true`).                                     |
| `dereferenceForLabelResolution` | `boolean`           | Fetch remote resources to resolve labels (default: `false`).                                           |
| `languages`                     | `string`            | Preferred UI languages as a comma-separated list in priority order (e.g. `"fr,en"`). Falls back to `navigator.languages` when empty. `sh:languageIn` still takes precedence. |
| `labelPredicates`               | `string`            | Optional comma-separated list of value-node label predicate IRIs, in priority order. Defaults to `rdfs:label`. |
| `preferSkolemizedBlankNodes`    | `boolean`           | Use skolemised IRIs (`urn:uuid:…`) instead of blank nodes for new nested resources (default: `false`). |

---

## Retrieving edited data

```js
// Returns a Turtle string
const turtle = await renderer.data('text/turtle');

// Returns JSON-LD
const jsonld = await renderer.data('application/ld+json');

// Returns an array of RDF/JS Quad objects
const quads = await renderer.data();
```

---

## Collection rendering

Omit `focusNode` to render **every** entity that the shape targets (via
`sh:targetClass`, `sh:targetNode`, or an implicit class target) instead of a
single node. Each item is rendered as its own Node UI Component.

The optional `focusNodeMode` attribute controls the presentation:

| `focusNodeMode`    | Behaviour |
|--------------------|-----------|
| _(unset, default)_ | A focus-node picker with an **"All items"** option; initially renders every item stacked. |
| `list`             | Every item stacked, no picker. |
| `picker`           | A focus-node picker **without** "All items"; initially renders the first item. |

```html
<shacl-renderer
  shapesGraphUrl="/shapes/person-shape.ttl"
  widgetScoringGraphUrl="/scoring/widget-scoring.ttl"
  dataGraphUrl="/data/people.ttl"
  constraintShape="http://example.org/PersonShape"
  focusNodeMode="list"
  mode="view"
></shacl-renderer>
```

Editing an item's fields works as usual (use `mode="view"` for read-only); all
items share one underlying data graph, so `element.data()` serialises every
edit. Adding or removing whole items is not currently supported.

Three styling slots target this mode: `collectionClass` (the stacked-list
container), `collectionItemClass` (each item wrapper), and `focusNodePickerClass`
(the picker dropdown).

---

## Widget scoring

The component decides which editor widget to show for a property value through a **widget-scoring graph** – an RDF document containing `shui:WidgetScore` instances.

Each `shui:WidgetScore` declares:

| Property                | Description                                                                                                                            |
|-------------------------|----------------------------------------------------------------------------------------------------------------------------------------|
| `shui:widget`           | The widget IRI (e.g. `shui:TextFieldEditor`).                                                                                          |
| `shui:score`            | A numeric score. Higher is better. A score of `-1` disables the widget entirely.                                                       |
| `shui:dataGraphShape`   | *(optional)* A SHACL shape validated against the **current value** in the data graph. The score only applies if the value conforms.    |
| `shui:shapesGraphShape` | *(optional)* A SHACL shape validated against the **property shape** in the shapes graph. The score only applies if the shape conforms. |

The widget with the **highest total score** is selected automatically. Users can still switch to any other eligible widget via the settings icon next to each field.

Example scoring entry (Turtle):

```turtle
PREFIX sh:   <http://www.w3.org/ns/shacl#>
PREFIX shui: <http://www.w3.org/ns/shacl-ui/>
PREFIX xsd:  <http://www.w3.org/2001/XMLSchema#>

shui:booleanEditorScore10
    a shui:WidgetScore ;
    shui:widget shui:BooleanEditor ;
    shui:score 10 ;
    shui:shapesGraphShape shui:hasDatatypeBooleanConstraint ;
.

shui:hasDatatypeBooleanConstraint
    a sh:NodeShape ;
    sh:property [
        sh:path sh:datatype ;
        sh:minCount 1 ;
        sh:hasValue xsd:boolean ;
    ] ;
.
```

The default scoring rules are available in [`src/assets/widget-scoring.ttl`](src/assets/widget-scoring.ttl).  
You can extend or override them by pointing `widgetScoringGraphUrl` at your own file.

To **force** a specific widget for a property shape, add `shui:editor` to the property shape in the shapes graph:

```turtle
ex:NamePropertyShape
    a sh:PropertyShape ;
    sh:path foaf:name ;
    sh:name "Full Name" ;
    sh:datatype xsd:string ;
    shui:editor shui:TextFieldEditor ;
.
```

---

## Available editor widgets

| Widget IRI                     | Description                                                                                               |
|--------------------------------|-----------------------------------------------------------------------------------------------------------|
| `shui:TextFieldEditor`         | Single-line text input.                                                                                   |
| `shui:TextAreaEditor`          | Multi-line text area.                                                                                     |
| `shui:TextFieldWithLangEditor` | Single-line input with a language-tag field.                                                              |
| `shui:TextAreaWithLangEditor`  | Multi-line textarea with a language-tag field.                                                            |
| `shui:NumberFieldEditor`       | Numeric input; respects `sh:minInclusive` / `sh:maxInclusive`.                                            |
| `shui:BooleanEditor`           | Checkbox.                                                                                                 |
| `shui:DatePickerEditor`        | Date picker (`xsd:date`).                                                                                 |
| `shui:DateTimePickerEditor`    | Date-time picker (`xsd:dateTime`).                                                                        |
| `shui:EnumSelectEditor`        | Dropdown populated from `sh:in` values.                                                                   |
| `shui:AutoCompleteEditor`      | Searchable autocomplete over class instances in the data graph.                                           |
| `shui:InstancesSelectEditor`   | Dropdown over class instances in the data graph.                                                          |
| `shui:IRIEditor`               | URL input for IRI values.                                                                                 |
| `shui:DetailsEditor`           | Inline nested form for blank-node or IRI-valued properties (driven by inline `sh:property` or `sh:node`). |
| `shui:SubClassEditor`          | Searchable autocomplete over sub-classes of `sh:rootClass`.                                               |
| `shui:RichTextEditor`          | WYSIWYG HTML editor with toolbar; stores `rdf:HTML` literals.                                             |
| `shui:BlankNodeEditor`         | Read-only display of blank-node identifiers.                                                              |

---

## Available viewer widgets (view mode)

Set `mode="view"` to render the data read-only using **viewer** widgets instead of editors. Viewers are selected by the same [widget-scoring](#widget-scoring) mechanism (a viewer is preferred with `shui:viewer` on the property shape, mirroring `shui:editor`), and are styled with their own Tailwind slots (below) so they support light and dark mode just like the editors.

| Widget IRI                | Applies to                        | Rendering                                                                     |
|---------------------------|-----------------------------------|-------------------------------------------------------------------------------|
| `shui:LiteralViewer`      | any literal                       | The lexical form of the value.                                                |
| `shui:LangStringViewer`   | `rdf:langString`                  | The text plus a language-tag indicator.                                       |
| `shui:HTMLViewer`         | `rdf:HTML` / `xsd:string`         | The literal parsed into sanitized HTML DOM elements.                          |
| `shui:HyperlinkViewer`    | `xsd:anyURI` / `xsd:string`       | A clickable hyperlink to the URI/URL.                                         |
| `shui:ImageViewer`        | IRIs/literals with image ext.     | The image at the URL (`<img>`), with a text fallback if it fails to load.     |
| `shui:IRIViewer`          | IRIs                              | A hyperlink to the IRI, showing the IRI.                                      |
| `shui:LabelViewer`        | IRIs                              | A hyperlink to the IRI, showing the resource's display label.                 |
| `shui:BlankNodeViewer`    | blank nodes                       | A human-readable label of the blank node (falls back to its `_:id`).          |
| `shui:DetailsViewer`      | IRIs or blank nodes               | The value node's details rendered as a nested, read-only sub-form.            |
| `shui:ValueTableViewer`   | multiple values (needs `sh:node`) | All values in one scrollable, paginated table; columns from the `sh:node` shape ordered by `sh:order`. |

---

## Styling & Tailwind CSS classes

Every visual part of the component can be restyled by passing Tailwind CSS class strings as attributes. The value you provide is **merged on top of the built-in default** using [`tailwind-merge`](https://github.com/dcastil/tailwind-merge), so conflicting utility classes are resolved in your favour while defaults that are not overridden remain in place.

For example, passing `labelClass="text-blue-700"` keeps all the existing default label classes (`block`, `text-sm`, `font-bold`, `mb-1`, …) and only replaces the colour:

```html
<!-- default: 'block text-zinc-700 dark:text-zinc-100 text-sm font-bold mb-1' -->
<!-- result:  'block dark:text-zinc-100 text-sm font-bold mb-1 text-blue-700' -->
<shacl-renderer labelClass="text-blue-700" ...></shacl-renderer>
```

The full list of styling attributes and their built-in defaults is shown below.

| Attribute                                  | Default value                                                                                                                                                                                                      |
|--------------------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `componentClass`                           | `bg-white dark:bg-zinc-800`                                                                                                                                                                                        |
| `spinnerClass`                             | `h-8 w-8 animate-spin rounded-full border-4 border-zinc-300 border-t-zinc-700 dark:border-zinc-700 dark:border-t-zinc-200`                                                                                         |
| `labelClass`                               | `block text-zinc-700 dark:text-zinc-100 text-sm font-bold mb-1`                                                                                                                                                    |
| `descriptionClass`                         | `-mt-1 text-xs text-zinc-500 dark:text-zinc-200 mb-2`                                                                                                                                                              |
| `globalFieldClass`                         | `text-zinc-700 dark:text-zinc-100 leading-tight mb-2`                                                                                                                                                              |
| `globalInputFieldClass`                    | `w-full shadow appearance-none border dark:border-zinc-200 rounded py-2 px-3 pr-8 focus:outline-none focus:shadow-outline focus:border-zinc-400 dark:focus:border-zinc-300`                                        |
| `autoCompleteEditorClass`                  | `relative`                                                                                                                                                                                                         |
| `autoCompleteEditorDropdownClass`          | `absolute z-50 w-full bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-600 rounded-md shadow-lg mt-1 max-h-60 overflow-auto`                                                                      |
| `autoCompleteEditorOptionClass`            | `px-3 py-2 cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-700`                                                                                                                                                |
| `autoCompleteEditorLabelClass`             | `font-medium`                                                                                                                                                                                                      |
| `autoCompleteEditorDescriptionClass`       | `text-sm text-zinc-500 dark:text-zinc-200`                                                                                                                                                                         |
| `blankNodeEditorClass`                     | *(empty)*                                                                                                                                                                                                          |
| `textFieldEditorClass`                     | *(empty)*                                                                                                                                                                                                          |
| `textAreaEditorClass`                      | *(empty)*                                                                                                                                                                                                          |
| `numberFieldEditorClass`                   | *(empty)*                                                                                                                                                                                                          |
| `booleanEditorClass`                       | `mr-2`                                                                                                                                                                                                             |
| `booleanEditorLabelClass`                  | *(empty)*                                                                                                                                                                                                          |
| `datePickerEditorClass`                    | *(empty)*                                                                                                                                                                                                          |
| `dateTimePickerEditorClass`                | *(empty)*                                                                                                                                                                                                          |
| `enumSelectEditorClass`                    | *(empty)*                                                                                                                                                                                                          |
| `enumSelectEditorIconClass`                | `h-4 w-4 text-zinc-500 dark:text-zinc-400`                                                                                                                                                                         |
| `iriEditorClass`                           | *(empty)*                                                                                                                                                                                                          |
| `detailsEditorClass`                       | `ml-4 border-l dark:border-zinc-200 pl-4 relative`                                                                                                                                                                 |
| `plusIconClass`                            | `size-6 float-right text-green-600 dark:text-green-400 cursor-pointer hover:text-green-700 dark:hover:text-green-500`                                                                                              |
| `xIconClass`                               | `size-5 -mr-1 mt-4 cursor-pointer text-zinc-900 dark:text-zinc-50`                                                                                                                                                 |
| `groupClass`                               | `md:flex md:gap-x-4 md:flex-wrap`                                                                                                                                                                                  |
| `groupLabelClass`                          | `font-bold md:basis-full dark:text-zinc-50 text-zinc-800`                                                                                                                                                          |
| `groupElementClass`                        | `md:flex-1`                                                                                                                                                                                                        |
| `alternativePathDescriptionClass`          | `text-xs italic text-zinc-500 dark:text-zinc-200 mb-2 -mt-1 hover:text-zinc-700 dark:hover:text-zinc-100 cursor-pointer`                                                                                           |
| `alternativePathSelectClass`               | `absolute z-50 bg-white dark:bg-zinc-800 border dark:border-zinc-600 rounded shadow-md -mt-t`                                                                                                                      |
| `alternativePathOptionClass`               | `px-2 py-1 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-700 cursor-pointer`                                                                                                                                        |
| `alternativePathOptionSelectedClass`       | `font-bold`                                                                                                                                                                                                        |
| `selectWidgetIconClass`                    | `size-6 cursor-pointer text-zinc-500 dark:text-zinc-200 hover:text-zinc-700 dark:hover:text-zinc-100`                                                                                                              |
| `selectWidgetDropdownClass`                | `absolute right-0 mt-2 origin-top-right transform translate-x-0 z-50 min-w-64 bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-600 rounded-md shadow-lg max-h-80 w-md overflow-auto max-w-[85vw]` |
| `selectWidgetOptionClass`                  | `px-4 py-2 cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-700`                                                                                                                                                |
| `selectWidgetOptionSelectedClass`          | `bg-zinc-100 dark:bg-zinc-700`                                                                                                                                                                                     |
| `selectWidgetLabelClass`                   | `font-medium text-zinc-800 dark:text-zinc-200`                                                                                                                                                                     |
| `selectWidgetDescriptionClass`             | `text-sm text-zinc-500 dark:text-zinc-400`                                                                                                                                                                         |
| `selectWidgetScoreClass`                   | `text-xs text-zinc-400 dark:text-zinc-500 ml-3`                                                                                                                                                                    |
| `subClassEditorClass`                      | `relative`                                                                                                                                                                                                         |
| `subClassEditorDropdownClass`              | `absolute z-50 w-full bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-600 rounded-md shadow-lg mt-1 max-h-60 overflow-auto`                                                                      |
| `subClassEditorOptionClass`                | `px-3 py-2 cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-700`                                                                                                                                                |
| `subClassEditorOptionSelectedClass`        | `bg-zinc-100 dark:bg-zinc-700`                                                                                                                                                                                     |
| `subClassEditorLabelClass`                 | `font-medium`                                                                                                                                                                                                      |
| `subClassEditorDescriptionClass`           | `text-sm text-zinc-500 dark:text-zinc-400`                                                                                                                                                                         |
| `detailsClassSelectClass`                  | `relative`                                                                                                                                                                                                         |
| `detailsClassSelectDropdownClass`          | `absolute z-50 w-full bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-600 rounded-md shadow-lg mt-1 max-h-60 overflow-auto`                                                                      |
| `detailsClassSelectOptionClass`            | `px-3 py-2 cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-700`                                                                                                                                                |
| `detailsClassSelectOptionSelectedClass`    | `bg-zinc-100 dark:bg-zinc-700`                                                                                                                                                                                     |
| `detailsClassSelectLabelClass`             | `font-medium`                                                                                                                                                                                                      |
| `detailsClassSelectDescriptionClass`       | `text-sm text-zinc-500 dark:text-zinc-400`                                                                                                                                                                         |
| `instancesSelectEditorClass`               | `relative min-h-9`                                                                                                                                                                                                 |
| `instancesSelectEditorIconClass`           | `size-4 text-zinc-500 dark:text-zinc-400`                                                                                                                                                                          |
| `instancesSelectEditorDropdownClass`       | `absolute z-50 w-full bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-600 rounded-md shadow-lg mt-1 max-h-60 overflow-auto`                                                                      |
| `instancesSelectEditorOptionClass`         | `px-3 py-2 cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-700`                                                                                                                                                |
| `instancesSelectEditorOptionSelectedClass` | `bg-zinc-100 dark:bg-zinc-700`                                                                                                                                                                                     |
| `instancesSelectEditorLabelClass`          | `font-medium`                                                                                                                                                                                                      |
| `instancesSelectEditorDescriptionClass`    | `text-sm text-zinc-500 dark:text-zinc-400`                                                                                                                                                                         |
| `richTextEditorClass`                      | `border dark:border-zinc-600 rounded-md shadow-sm`                                                                                                                                                                 |
| `richTextEditorToolbarClass`               | `flex flex-wrap gap-1 border-b dark:border-zinc-600 rounded-t-md bg-zinc-50 dark:bg-zinc-800 p-2 pr-8`                                                                                                             |
| `richTextEditorButtonClass`                | `px-2 py-1 text-sm hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded cursor-pointer justify-center flex items-center`                                                                                               |
| `richTextEditorSelectClass`                | `text-sm border dark:border-zinc-600 rounded px-1 cursor-pointer`                                                                                                                                                  |
| `richTextEditorContentClass`               | `min-h-50 p-3 focus:outline-none prose max-w-none`                                                                                                                                                                 |
| `richTextEditorRawContentClass`            | `w-full min-h-50 p-2 focus:outline-none`                                                                                                                                                                           |
| `orSelectorClass`                          | `relative`                                                                                                                                                                                                         |
| `orSelectorDropdownClass`                  | `absolute z-50 w-full bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-600 rounded-md shadow-lg mt-1 max-h-60 overflow-auto`                                                                      |
| `orSelectorOptionClass`                    | `px-3 py-2 cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-700`                                                                                                                                                |
| `orSelectorOptionSelectedClass`            | `bg-zinc-100 dark:bg-zinc-700`                                                                                                                                                                                     |
| `orSelectorLabelClass`                     | `font-medium`                                                                                                                                                                                                      |
| `orSelectorDescriptionClass`               | `text-sm text-zinc-500 dark:text-zinc-200`                                                                                                                                                                         |
| `viewerFieldClass`                         | `py-2`                                                                                                                                                                                                             |
| `viewerLabelClass`                         | `text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400 mb-1`                                                                                                                                |
| `viewerDescriptionClass`                   | `text-xs text-zinc-400 dark:text-zinc-500 mb-1`                                                                                                                                                                    |
| `viewerValuesClass`                        | `flex flex-col gap-1`                                                                                                                                                                                              |
| `viewerValueClass`                         | `text-sm text-zinc-800 dark:text-zinc-100 leading-relaxed`                                                                                                                                                         |
| `viewerEmptyClass`                         | `text-sm text-zinc-400 dark:text-zinc-500 italic`                                                                                                                                                                 |
| `literalViewerClass`                       | `text-zinc-800 dark:text-zinc-100 break-words whitespace-pre-wrap`                                                                                                                                                 |
| `langStringViewerClass`                    | `inline-flex items-baseline gap-1.5 text-zinc-800 dark:text-zinc-100 break-words`                                                                                                                                  |
| `langStringViewerTagClass`                 | `shrink-0 text-[0.65rem] font-medium uppercase tracking-wide px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-700 text-zinc-500 dark:text-zinc-300`                                                                   |
| `iriViewerClass`                           | `text-blue-600 dark:text-blue-400 hover:underline break-all`                                                                                                                                                       |
| `hyperlinkViewerClass`                     | `inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:underline break-all`                                                                                                                        |
| `imageViewerClass`                         | `max-w-full h-auto max-h-64 rounded border border-zinc-200 dark:border-zinc-700 object-contain`                                                                                                                    |
| `htmlViewerClass`                          | `prose prose-zinc dark:prose-invert max-w-none text-zinc-800 dark:text-zinc-100`                                                                                                                                   |
| `blankNodeViewerClass`                     | `italic text-zinc-600 dark:text-zinc-300 break-words`                                                                                                                                                              |
| `detailsViewerClass`                       | `rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50/60 dark:bg-zinc-800/40 px-4 py-1`                                                                                                               |
| `valueTableViewerClass`                    | `w-full overflow-auto max-h-96 border border-zinc-200 dark:border-zinc-700 rounded-md`                                                                                                                             |
| `valueTableViewerHeaderClass`              | `sticky top-0 bg-zinc-50 dark:bg-zinc-900 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-300 px-3 py-2 border-b border-zinc-200 dark:border-zinc-700`                         |
| `valueTableViewerRowClass`                 | `border-b border-zinc-100 dark:border-zinc-800 last:border-0 hover:bg-zinc-50 dark:hover:bg-zinc-700/40`                                                                                                            |
| `valueTableViewerCellClass`                | `px-3 py-2 align-top text-sm text-zinc-800 dark:text-zinc-100`                                                                                                                                                     |
| `valueTablePaginationClass`                | `flex items-center justify-between gap-2 px-3 py-2 text-sm text-zinc-500 dark:text-zinc-400 border-t border-zinc-200 dark:border-zinc-700`                                                                          |
| `valueTablePaginationButtonClass`          | `px-2 py-1 rounded border border-zinc-300 dark:border-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer`                                            |
| `collectionClass`                          | `flex flex-col gap-6`                                                                                                                                                                                              |
| `collectionItemClass`                      | `border-b border-zinc-200 dark:border-zinc-700 pb-6 last:border-0 last:pb-0`                                                                                                                                       |
| `focusNodePickerClass`                     | `mb-4 w-full shadow appearance-none border dark:border-zinc-200 rounded py-2 px-3 pr-8 focus:outline-none focus:shadow-outline focus:border-zinc-400 dark:focus:border-zinc-300`                                   |

---

## Contributing

Contributions are very welcome! Here is how to get started.

### Prerequisites

- [Node.js](https://nodejs.org/) ≥ 20
- npm

### Setup

```bash
git clone https://github.com/your-org/shacl-ui.js.git
cd shacl-ui.js
npm install
```

### Development server

```bash
npm run dev
```

This starts a Vite dev server with live-reload.  
Open one of the example pages in `src/` (e.g. `http://localhost:5173/src/index.html`) to see the component in action.

### Project structure

```
lib/
  shacl-renderer.ts      # The <shacl-renderer> custom element
  utils/
    rdf.ts               # RDF parsing, serialisation, dereferencing
    ui.ts                # SHACL → UIComponent tree construction
    widgets.ts           # Lit templates for every editor widget
    score.ts             # Widget-scoring engine
    types.ts             # Shared TypeScript types
    namespaces.ts        # RDF namespace helpers
src/
  assets/                # Example RDF data, shapes, and scoring files
```

### Adding a new widget

1. Add your widget IRI to `lib/utils/namespaces.ts` (the `shui` helper).
2. Add a rendering function in `lib/utils/widgets.ts` and wire it into the `renderWidget` switch.
3. Add a default term factory case in `getDefaultTermForWidget`.
4. Add an optional Tailwind class property and its default to `ShaclRenderer.DEFAULTS` in `lib/shacl-renderer.ts` and the `TailwindClasses` type in `lib/utils/types.ts`.
5. Add scoring entries in `src/assets/widget-scoring.ttl` (or document how users should supply their own).

### Building the library

```bash
npm run build
```

Output is written to `dist/`.

### Pull requests

- Fork the repository and create a feature branch.
- Keep commits focused and well-described. This project follows the [Conventional Commits](https://www.conventionalcommits.org/) specification:
  - `feat:` – a new feature
  - `fix:` – a bug fix
  - `docs:` – documentation-only changes
  - `refactor:` – a change that neither fixes a bug nor adds a feature
  - `chore:` – build process or tooling changes
  - `test:` – adding or updating tests

  Example: `feat: add ImageEditor widget for rdf:HTML image literals`
- Open a pull request against `main` with a clear description of your changes.

