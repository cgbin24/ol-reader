// vitepress/plugins/disableLinkValidation.js
export default () => ({
  extendMarkdown(md) {
    // 自定义规则或者使用现成的库，例如markdown-it-disable-url-check
    const myRender = md.renderer.rules.link_open || md.renderer.renderToken;
 
    md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
      // 在这里可以修改或者清除tokens中关于链接的验证逻辑
      // 例如，可以直接返回原始的打开标签，不做任何处理
      return myRender(tokens, idx, options, env, self);
    };
  }
});