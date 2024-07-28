
import fs from 'fs'
import path from 'path'


// 解析目录树
function parseTree(dir) {
  const files = fs.readdirSync(dir);
  const result = [];
  for (const file of files) {
    const filePath = path.resolve(dir, file);
    const stat = fs.statSync(filePath);
    // 排除配置文件，如 .DS_Store
    if (file.startsWith('.')) {
      continue;
    }
    if (stat.isDirectory()) {
      result.push({
        name: file,
        path: filePath,
        dir: dir,
        // pPath, 相对于public目录的路径+文件名
        pPath: filePath.split('public')[1],
        children: parseTree(filePath)
      });
    } else {
      result.push({
        name: file,
        path: filePath,
        dir: dir,
        pPath: filePath.split('public')[1],
      });
    }
  }
  return sortTree(result, 'name');
}

// 按指定类型排序目录树
function sortTree(tree, sortType) {
  return tree.sort((a, b) => {
    const numA = parseFloat(a[sortType]);
    const numB = parseFloat(b[sortType]);
    // 如果两者都是数字，则按数字大小排序
    if (!isNaN(numA) && !isNaN(numB)) {
      return numA - numB;
    }
    // 如果只有一个是数字，则优先考虑数字
    if (!isNaN(numA)) return -1;
    if (!isNaN(numB)) return 1;
    // 如果两者都不是数字，则将它们作为字符串进行比较
    return a[sortType].localeCompare(b[sortType], 'zh');
  });
}

// 清空目录，即删除目录下所有文件
function clearDir(dir, delCurDir = false) {
  if (fs.existsSync(dir)) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      const filePath = path.resolve(dir, file);
      const stat = fs.statSync(filePath);
      if (stat.isDirectory()) {
        fs.rmdirSync(filePath, { recursive: true });
      } else {
        fs.unlinkSync(filePath);
      }
    }
  }
  if (delCurDir) {
    fs.rmdirSync(dir);
  }
}

// 将目录树输出到指定文件夹，内容转为md文件
function treeToMd(treeObj, dir) {
  // 当前目录存在时，先将内容清空
  clearDir(path.resolve(dir, treeObj.name));
  if (treeObj.children) {
    // console.log('====> dir:', dir, 'name:', treeObj.name, path.resolve(dir, treeObj.name));
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
  // console.log(1);
  // console.log(path);
  // <PdfViewer pdfUrl="${path}"/>
  return `
<PdfViewer src="${path}"/>

<script setup>
  // import PdfViewer from '/components/pdfViewer.vue'
  // import PdfViewer from '/components/plib.vue'
  // import PdfViewer from '/components/p.vue'
  // import PdfViewer from '/components/pd2.vue'
  // import PdfViewer from '/components/pd.vue'
  import PdfViewer from '/components/vP/index.vue'
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