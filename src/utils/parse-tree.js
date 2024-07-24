
import fs from 'fs'
import path from 'path'


// 解析目录树
function parseTree(dir) {
  const files = fs.readdirSync(dir);
  const result = [];
  for (const file of files) {
    const filePath = path.resolve(dir, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      result.push({
        name: file,
        path: filePath,
        dir: dir,
        // pPath, 相对于public目录的路径+文件名
        pPath: filePath.split('public')[1],
        children: parseTree(filePath)
      });
    }
    else {
      result.push({
        name: file,
        path: filePath,
        dir: dir,
        pPath: filePath.split('public')[1],
      });
    }
  }
  // console.log(result);
  return result;
}

// 将目录树输出到指定文件夹，内容转为md文件
function treeToMd(treeObj, dir) {
  // 当前目录存在时，先将内容清空
  if (fs.existsSync(path.resolve(dir, treeObj.name))) {
    const files = fs.readdirSync(path.resolve(dir, treeObj.name));
    for (const file of files) {
      fs.unlinkSync(path.resolve(dir, treeObj.name, file));
    }
  }
  if (treeObj.children) {
    // console.log('dir:', dir, 'name:', treeObj.name, path.resolve(dir, treeObj.name));
    fs.mkdirSync(path.resolve(dir, treeObj.name), { recursive: true });
    for (const item of treeObj.children) {
      if (item.children) {
        treeToMd(item, path.resolve(dir, treeObj.name));
      }
      else {
        fs.writeFileSync(path.resolve(dir, treeObj.name, item.name.replace(/\.\w+$/, '') + '.md'), mdTemp(item.pPath));
      }
    }
  }
}

// md文件模板
const mdTemp = (path) => {
  console.log(1);
  console.log(path);
  // <PdfViewer pdfUrl="${path}"/>
  return `
<PdfViewer src="${path}"/>

<script setup>
  // import PdfViewer from '/components/pdfViewer.vue'
  // import PdfViewer from '/components/pv.vue'
  import PdfViewer from '/components/pd2.vue'
</script>
  `
}
// 当前项目中查找指定文件位置，返回相对路径
function findFile(dir, fileName) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filePath = path.resolve(dir, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      const result = findFile(filePath, fileName);
      if (result) {
        return result;
      }
    }
    else {
      if (file === fileName) {
        return filePath;
      }
    }
  }
}

export {
  parseTree,
  treeToMd
}