import {html, LitElement, type PropertyValues} from 'lit'
import {customElement, property} from 'lit/decorators.js'
import litLogo from './assets/lit.svg'
import viteLogo from '/vite.svg'
import {TW} from "./shared/tailwindMixin";

const TwLitElement = TW(LitElement);

/**
 * The main element of this library.
 *
 * @slot - This element has a slot
 * @csspart button - The button
 */
@customElement('shacl-renderer')
export class ShaclRenderer extends TwLitElement {
  @property()
  dataGraph: string = ''

  @property()
  shapesGraph: string = ''

  @property()
  focusNode: string = ''

  @property()
  globalClass: string = ''

  /**
   * Copy for the read the docs hint.
   */
  @property()
  docsHint = 'Click on the Vite and Lit logos to learn more'

  /**
   * The number of times the button has been clicked.
   */
  @property({ type: Number })
  count = 0

  render() {
    return html`
      <div>
        <a href="https://vite.dev" target="_blank">
          <img src=${viteLogo} class="logo" alt="Vite logo" />
        </a>
        <a href="https://lit.dev" target="_blank">
          <img src=${litLogo} class="logo lit" alt="Lit logo" />
        </a>
      </div>
      <slot></slot>
      <div class="card">
        <button @click=${this._onClick} part="button">
          count is ${this.count}
        </button>
      </div>
      <p class="read-the-docs text-red-900">${this.docsHint}</p>
    `
  }

  protected willUpdate(changedProperties: PropertyValues) {
    if (changedProperties.has('dataGraph')) {
      console.log('dataGraph changed to', this.dataGraph)
    }
    if (changedProperties.has('shapesGraph')) {
      console.log('shapesGraph changed to', this.shapesGraph)
    }
  }

  private _onClick() {
    this.count++
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'my-element': ShaclRenderer
  }
}
