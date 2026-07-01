import {describe, expect, it} from "vitest";
import {ShaclRenderer} from "../lib/shacl-renderer.ts";

function rootDivClass(el: ShaclRenderer): string {
   const root = el.shadowRoot ?? el;
   return root.querySelector("div")?.getAttribute("class") ?? "";
}

describe("styling slots (single source of truth)", () => {
   it("applies the built-in default when no override is given", async () => {
      const el = document.createElement("shacl-renderer") as ShaclRenderer;
      document.body.appendChild(el);
      await el.updateComplete;
      expect(rootDivClass(el)).toContain("bg-white");
      el.remove();
   });

   it("merges a user slot override on top of the default", async () => {
      const el = document.createElement("shacl-renderer") as ShaclRenderer;
      // Lit lowercases the attribute name for the `componentClass` property.
      el.setAttribute("componentclass", "bg-red-500");
      document.body.appendChild(el);
      await el.updateComplete;
      const cls = rootDivClass(el);
      // tailwind-merge keeps the override's background and drops the conflicting default bg.
      expect(cls).toContain("bg-red-500");
      expect(cls).not.toContain("bg-white");
      el.remove();
   });

   it("exposes DEFAULTS derived from the single STYLING_SLOTS source", () => {
      expect(ShaclRenderer.DEFAULTS.componentClass).toBe("bg-white dark:bg-zinc-800");
      expect(ShaclRenderer.DEFAULTS.orSelectorDescriptionClass).toContain("text-sm");
   });

   it("includes viewer slots with dark-mode variants", () => {
      expect(ShaclRenderer.DEFAULTS.literalViewerClass).toContain("dark:text-zinc-100");
      expect(ShaclRenderer.DEFAULTS.iriViewerClass).toContain("dark:text-blue-400");
      expect(ShaclRenderer.DEFAULTS.valueTableViewerHeaderClass).toContain("dark:");
   });
});
