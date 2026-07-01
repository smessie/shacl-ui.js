/**
 * Public surface of the widget-rendering layer.
 *
 * The implementation is split across lib/presentation/widgets/:
 *   - layout.ts               - root dispatch (slots → components → widget switch)
 *   - shared.ts               - shared render helpers, icons, default-value logic
 *   - editors-fields.ts       - text / number / date / boolean / IRI / blank-node editors
 *   - editors-select.ts       - autocomplete / enum / instances / subclass / class-select editors
 *   - editors-rich-nested.ts  - rich-text and nested details editors
 *   - viewers-literal.ts      - read-only literal viewers (view mode)
 *   - viewers-node.ts         - read-only IRI / blank-node / image viewers (view mode)
 *   - viewers-nested.ts       - read-only details and value-table viewers (view mode)
 */
export {renderRootSlots, renderUIComponents, renderUIComponent, renderEditor, renderViewer} from "./widgets/layout.ts";
export {getDefaultTermForWidget} from "./widgets/shared.ts";
export {renderHTMLViewer, renderHyperlinkViewer, renderLangStringViewer, renderLiteralViewer} from "./widgets/viewers-literal.ts";
export {renderBlankNodeViewer, renderIRIViewer, renderImageViewer, renderLabelViewer} from "./widgets/viewers-node.ts";
export {renderDetailsViewer, renderValueTableViewer} from "./widgets/viewers-nested.ts";
