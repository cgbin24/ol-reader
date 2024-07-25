import { defineConfig } from 'vitepress'
import { parseTree, treeToMd } from '../../src/utils/parse-tree'
import topLevelAwait from 'vite-plugin-top-level-await'
import pdfjsPatch from '../../src/utils/vite-plugin-pdfjs-fix'

// https://vitepress.dev/reference/site-config
const basePath = '/i-reader'
export default defineConfig({
  title: "i-Reader",
  description: "online reader",
  srcDir: '../src',
  outDir: '../dist',
  
  head: [
    ['link', { rel: 'icon', href: '/static/favicon.ico' }],
    ['link', { rel: 'stylesheet', href: '/static/reset.css' }],
    ['meta', { name: 'author', content: 'cgbin24' }],
    ['meta', { name: 'keywords', content: 'i-Reader, online reader' }],
    ['meta', { name: 'description', content: 'i-Reader, online reader' }],
  ],
  vite: {
    server: {
      host: '0.0.0.0',
      port: 1000,
    },
    plugins: [
      // pdfjsPatch(),
      // topLevelAwait({
      //     promiseExportName: '__tla',
      //     promiseImportName: (i) => `__tla_${i}`
      // })
    ],
    build: {
      target: 'esnext',
      commonjsOptions: {
        ignore: ['pdfjs-dist']
      },
      chunkSizeWarningLimit: 1000,
      rollupOptions: {
        // external: ['pdfjs-dist'],
        output: {
          manualChunks(id) {
            if (id.includes('node_modules')) {
              return id.toString().split('node_modules/')[1].split('/')[0].toString();
            }
          }
        }
      }
    },
    optimizeDeps: {
      include: ['pdfjs-dist', 'vue-pdf-embed'],
    },
  
  },
  themeConfig: {
    // https://vitepress.dev/reference/default-theme-config
    logo: '/static/favicon.png',
    nav: [
      { text: '主页', link: '/' },
      { text: '目录', link: '/i-reader' }
    ],
    sidebar: parseTree('./src/public/source')?.map(item => {
      treeToMd(item, './src'+basePath + '/source')
      return {
        text: item.name,
        // collapsible: true,
        // collapsed: true,
        items: item.children?.map(child => {
          console.log('link: ',basePath + child.pPath.replace(/\.\w+$/, ''));
          
          return {
            // 将文件名后缀去掉
            text: child.name.replace(/\.\w+$/, ''),
            link: basePath + child.pPath.replace(/\.\w+$/, '')
          }
        })
      }
    }),

    socialLinks: [
      { icon: 'github', link: 'https://github.com/cgbin24' }
    ]
  }
})
