export function findTailwindClassValue(className: string, classList: string): string | null {
   const classes = classList.split(/\s+/);
   for (const cls of classes) {
      if (cls.startsWith(className + "-")) {
         return cls.substring(className.length + 1);
      } else if (cls.startsWith("-" + className + "-")) {
         return "-" + cls.substring(className.length + 2);
      }
   }
   return null;
}

export function findTailwindMarginBottomValue(classList: string): string | null {
   return findTailwindClassValue("mb", classList) || findTailwindClassValue("my", classList);
}

export function findTailwindHeightValue(classList: string): string | null {
   return findTailwindClassValue("h", classList) || findTailwindClassValue("size", classList);
}
