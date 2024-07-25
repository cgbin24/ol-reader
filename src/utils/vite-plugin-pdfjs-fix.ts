import { Plugin } from 'vite';

export default function pdfjsFixPlugin(): Plugin {
  return {
    name: 'pdfjs-fix-plugin',
    transform(code: string, id: string) {
      // 替换 `Promise.withResolvers` 为模拟实现
      if (id.endsWith('pdf.mjs')) {
        const patchedCode = code.replace(
          /Promise\.withResolvers\(\)/g,
          `{
            promise: new Promise((resolve, reject) => {
              this.resolve = resolve;
              this.reject = reject;
            }),
            resolve: () => { /* dummy function */ },
            reject: () => { /* dummy function */ }
          }`
        );
        return {
          code: patchedCode,
          map: null
        };
      }
      return null;
    }
  };
}
