import { defineConfig } from 'vitepress'
import { parseTree, treeToMd } from '../../src/utils/parse-tree'
import topLevelAwait from 'vite-plugin-top-level-await'
import pdfjsPatch from '../../src/utils/vite-plugin-pdfjs-fix'
import MarkdownIt from 'markdown-it'

// https://vitepress.dev/reference/site-config

export default defineConfig({
  title: "i-Reader",
  description: "online reader",
  srcDir: '../src',
  outDir: '../dist',
  markdown: {
    math: true,
    config: (md) => {
      md.use((md) => {
        const defaultRender = md.renderer.rules.link_open || function(tokens, idx, options, env, self) {
          return self.renderToken(tokens, idx, options);
        };

        md.renderer.rules.link_open = function(tokens, idx, options, env, self) {
          // Override link rendering to do nothing
          return '';
        };

        md.renderer.rules.link_close = function(tokens, idx, options, env, self) {
          // Override link rendering to do nothing
          return '';
        };
      });
    }
  },
  
  head: [
    ['link', { rel: 'icon', href: '/static/favicon.ico' }],
    // ['link', { rel: 'stylesheet', href: '/static/reset.css' }],
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
      // disableValidHref()
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
      { text: '目录', link: '/i-reader/pdfviewer/ruankao/', activeMatch: '/i-reader/' },
      { text: 'xiaoce', link: '/mdviewer/XIAOCE/', activeMatch: '/mdviewer/' },
    ],
    sidebar: {
      '/i-reader/': parseTree('./src/public/source/pdfviewer', 'public/source')?.map(item => {
        const basePath = '/i-reader'
        treeToMd(item, './src'+ basePath + '/pdfviewer')
        return {
          text: item.name,
          // collapsible: true,
          // collapsed: true,
          items: item.children?.map(child => {
            console.log('link: ',basePath + child.pPath.replace(/\.\w+$/, ''));
            if (child.children && child.children.length) {
              return {
                text: child.name,
                collapsed: true,
                items: child.children.map(c => {
                  return {
                    text: c.name.replace(/\.\w+$/, ''),
                    link: basePath + c.pPath.replace(/\.\w+$/, '')
                  }
                })
              }
            }
            return {
              // 将文件名后缀去掉
              text: child.name.replace(/\.\w+$/, ''),
              link: basePath + child.pPath.replace(/\.\w+$/, '')
            }
          })
        }
      }),
      '/mdviewer/XIAOCE/': parseTree('./src/mdviewer', 'src')?.map(item => {
        // const basePath = '/public'
        const basePath = ''
        return {
          text: item.name,
          // collapsible: true,
          // collapsed: true,
          items: item.children?.map(child => {
            // console.log('link2: ','/xiaoce' + child);
            if (child.children && child.children.length) {
              return {
                text: child.name,
                collapsed: true,
                items: child.children.map(c => {
                  console.log('link3: ', c.pPath.replace(/\.\w+$/, ''));
                  
                  return {
                    text: c.name.replace(/\.\w+$/, ''),
                    link: basePath + c.pPath.replace(/\.\w+$/, '')
                  }
                })
              }
            }
            return {
              // 将文件名后缀去掉
              text: child.name.replace(/\.\w+$/, ''),
              link: child.pPath.replace(/\.\w+$/, '')
            }
          })
        }
      }),
    },

    socialLinks: [
      { icon: 'github', link: 'https://github.com/cgbin24' }
    ]
  }
})
