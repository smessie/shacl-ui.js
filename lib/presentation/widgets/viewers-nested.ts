// Nested/recursive viewers (view mode): the details sub-form and the multi-value table.
import {html, nothing} from "lit";
import {twMerge} from "tailwind-merge";
import {type TailwindClasses, type UIComponent, type UIComponentValue} from "../../types.ts";
import {ShaclRenderer} from "../../shacl-renderer.ts";
import {renderUIComponents, renderViewer} from "./layout.ts";
import {shortLabel} from "./viewers-shared.ts";

/** How many rows a ValueTableViewer shows per page. */
const VALUE_TABLE_PAGE_SIZE = 10;

/** shui:DetailsViewer — the value node's details rendered as a nested, read-only sub-form. */
export function renderDetailsViewer(renderer: ShaclRenderer, uiComponent: UIComponent, _value: UIComponentValue, index: number, classes: TailwindClasses) {
   const childComponents = uiComponent.children ? (uiComponent.children[index] ?? []) : [];
   return html`
       <div class="${twMerge(classes.detailsViewerClass)}">
           ${renderUIComponents(renderer, childComponents, classes)}
       </div>
   `;
}

/** Render a single table cell from a nested child UIComponent's values. */
function renderTableCell(renderer: ShaclRenderer, child: UIComponent | undefined, classes: TailwindClasses) {
   if (!child || child.values.length === 0) {
      return html`<span class="text-zinc-400 dark:text-zinc-500">—</span>`;
   }
   return html`${child.values.map((v, i) => html`
       <div>${renderViewer(renderer, child, v, i, classes)}</div>
   `)}`;
}

/**
 * shui:ValueTableViewer — a multi-viewer that renders ALL values of a property into one table.
 * Columns come from the sh:node property shapes (uiComponent.defaultChild) ordered by sh:order;
 * each value is one row (uiComponent.children[rowIndex]). Scrolls and pages independently.
 */
export function renderValueTableViewer(renderer: ShaclRenderer, uiComponent: UIComponent, classes: TailwindClasses) {
   const columns = [...(uiComponent.defaultChild ?? [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
   const totalRows = uiComponent.values.length;
   const pageCount = Math.max(1, Math.ceil(totalRows / VALUE_TABLE_PAGE_SIZE));
   const page = Math.min(Math.max(0, renderer.valueTablePage[uiComponent.uuid] ?? 0), pageCount - 1);
   const start = page * VALUE_TABLE_PAGE_SIZE;
   const end = Math.min(start + VALUE_TABLE_PAGE_SIZE, totalRows);
   const rowIndices = Array.from({length: end - start}, (_, i) => start + i);

   // Without an sh:node shape there are no columns to derive; fall back to a single value column.
   const hasColumns = columns.length > 0;

   return html`
       <div class="${twMerge(classes.valueTableViewerClass)}">
           <table class="w-full border-collapse">
               <thead>
                   <tr>
                       ${hasColumns
                          ? columns.map(col => html`
                              <th class="${twMerge(classes.valueTableViewerHeaderClass)}">${col.label ?? shortLabel(col.iri.value)}</th>
                          `)
                          : html`<th class="${twMerge(classes.valueTableViewerHeaderClass)}">${uiComponent.label ?? 'Value'}</th>`}
                   </tr>
               </thead>
               <tbody>
                   ${rowIndices.map(rowIndex => {
                       const rowChildren = uiComponent.children?.[rowIndex] ?? [];
                       return html`
                           <tr class="${twMerge(classes.valueTableViewerRowClass)}">
                               ${hasColumns
                                  ? columns.map(col => {
                                      const cellChild = rowChildren.find(c => c.iri.equals(col.iri));
                                      return html`<td class="${twMerge(classes.valueTableViewerCellClass)}">${renderTableCell(renderer, cellChild, classes)}</td>`;
                                  })
                                  : html`<td class="${twMerge(classes.valueTableViewerCellClass)}">
                                      ${renderViewer(renderer, uiComponent, uiComponent.values[rowIndex], rowIndex, classes)}
                                  </td>`}
                           </tr>
                       `;
                   })}
               </tbody>
           </table>

           ${pageCount > 1 ? html`
               <div class="${twMerge(classes.valueTablePaginationClass)}">
                   <span>${start + 1}–${end} of ${totalRows}</span>
                   <span class="flex items-center gap-2">
                       <button class="${twMerge(classes.valueTablePaginationButtonClass)}"
                               ?disabled="${page <= 0}"
                               @click="${() => renderer.setValueTablePage(uiComponent.uuid, page - 1)}">
                           Previous
                       </button>
                       <span>Page ${page + 1} of ${pageCount}</span>
                       <button class="${twMerge(classes.valueTablePaginationButtonClass)}"
                               ?disabled="${page >= pageCount - 1}"
                               @click="${() => renderer.setValueTablePage(uiComponent.uuid, page + 1)}">
                           Next
                       </button>
                   </span>
               </div>
           ` : nothing}
       </div>
   `;
}
