/**
 * Public surface of the widget-rendering layer.
 *
 * The implementation is split across lib/presentation/widgets/:
 *   - layout.ts               - root dispatch (slots → components → widget switch)
 *   - shared.ts               - shared render helpers, icons, default-value logic
 *   - editors-fields.ts       - text / number / date / boolean / IRI / blank-node editors
 *   - editors-select.ts       - autocomplete / enum / instances / subclass / class-select editors
 *   - editors-rich-nested.ts  - rich-text and nested details editors
 */
export {renderRootSlots, renderUIComponents, renderUIComponent} from "./widgets/layout.ts";
export {getDefaultTermForWidget} from "./widgets/shared.ts";
