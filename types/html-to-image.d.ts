declare module 'html-to-image' {
  export type HtmlToImageOptions = {
    filter?: (domNode: HTMLElement) => boolean
    width?: number
    height?: number
    style?: Partial<CSSStyleDeclaration>
    cacheBust?: boolean
    backgroundColor?: string
    pixelRatio?: number
    skipAutoScale?: boolean
  }

  export function toPng(node: HTMLElement, options?: HtmlToImageOptions): Promise<string>
}
