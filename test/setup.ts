// Vitest setup: provide browser globals the library reads at module/field-init time.
// `shacl-renderer.ts` reads `window.matchMedia(...)` when its `theme` field initializes,
// which happy-dom does not always implement.
if (typeof window !== "undefined" && typeof window.matchMedia !== "function") {
   window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
   })) as unknown as typeof window.matchMedia;
}
