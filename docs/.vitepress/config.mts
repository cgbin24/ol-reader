import { defineConfig } from 'vitepress'
import { parseTree, treeToMd } from '../../src/utils/parse-tree'

// https://vitepress.dev/reference/site-config
const basePath = '/i-reader'
export default defineConfig({
  title: "i-Reader",
  description: "online reader",
  srcDir: '../src',
  outDir: '../dist',
  vite: {
    server: {
      host: '0.0.0.0',
      port: 1000,
    }
  },
  themeConfig: {
    // https://vitepress.dev/reference/default-theme-config
    nav: [
      { text: '主页', link: '/' },
      { text: '目录', link: '/i-reader' }
    ],
    sidebar: parseTree('./src/public').map(item => {
      treeToMd(item, './src/'+basePath)
      return {
        text: item.name,
        // collapsible: true,
        // collapsed: true,
        items: item.children.map(child => {
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
