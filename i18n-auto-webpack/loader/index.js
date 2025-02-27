// 运行流程，修改js文件的一些操作，在热更新请求的时候 替换的是热更新内存中的文件

const loaderUtils = require("loader-utils");
const baseParse = require("@babel/parser");
const traverse = require("@babel/traverse");
const generator = require("@babel/generator");

const { transCode, localeWordPattern } = require("./transform.js");

const { setConfig, setCurrentCompileResourceMap, addCompiledFiles, getKey, getCompileDone, globalSetting } = require("../common/collect.js");

function isInConsole(path) {
  const { type: parentType, callee: parentCallee } = path.parent;
  if (parentType === "CallExpression" && parentCallee.type === "MemberExpression") {
    const parentCalleeObject = parentCallee.object;
    if (parentCalleeObject.type === "Identifier" && parentCalleeObject.name === "console") {
      return true;
    }
  }
  return false;
}

/**
 * @param {string} source - 输入文件的源代码内容
 * @returns {string} - 处理后的内容
 */
function simpleLoader(code) {
  // 标记 loader 为可缓存的，提高构建性能
  this.cacheable && this.cacheable();
  const { resourcePath } = this;
  const keyInCodes = [];

  const collection = []; //收集中文
  // 待办 能不能做增量更新

  // 获取当前处理的文件路径
  const filePath = this.resourcePath;
  const fileName = filePath.split("/").pop();
  // 如果是开发环境，添加控制台日志便于调试
  if (process.env.NODE_ENV === "development") {
    console.log(`[simple-loader] 处理文件: ${fileName}`);
  }
  // 拿到src下的所有代码
  // parse 解析js
  // ??? 在js上 拿到render函数
  // 待办 我想知道.vue是如何变成这一串的
  // vue-loader 先拿到.vue 然后拆分成三个模块，module识别到js模块 放到js传输带

  // 获取 loader 选项
  const {
    includes = [],
    excludes = [],
    name = "this.$t",
    // alias = [],
    // watch,
    dependency, // {name, value, objectPattern}
    transform = true,
    // fallback = false,
  } = this.getOptions() || {};

  // 处理排除文件 如果包含在内直接返回
  if (excludes.length && excludes.some((item) => resourcePath.indexOf(item) === 0)) {
    return code;
  }

  // 处理include
  if (includes.length && includes.every((item) => resourcePath.indexOf(item) !== 0)) {
    return code;
  }
  // esm进行解析
  let ast = baseParse.parse(code, {
    sourceType: "unambiguous",
  });

  const visitor = {
    StringLiteral(path) {
      if (["ExportAllDeclaration", "ImportDeclaration", "ExportNamedDeclaration"].indexOf(path.parent.type) !== -1) {
        return;
      }

      // if (findCommentExclude(path)) {
      //   return;
      // }

      if (isInConsole(path)) {
        return;
      }

      if (path.node.type === "StringLiteral") {
        const val = path.node.value;
        if (globalSetting.localePattern.test(val)) {
          const res = localeWordPattern(val);
          if (res && res.length) {
            // (changeOnce || fallback) &&
            // 这是啥 后续优化
            // if (res.some((word) => !getKey(word))) {
            //   return;
            // }
            const wordKeyMap = {};
            res.forEach((word) => {
              // 设置国际化语言包的key
              const key = setConfig(word);
              collection.push({ [key]: word });
              wordKeyMap[word] = key;
            });
            transform && transCode({ path, originValue: val, wordKeyMap, calle: name });
          }
        }
      }
    },
  };

  traverse.default(ast, visitor);

  // 是否收集到了语言包
  const hasLang = collection.length;

  const newCode = generator.default(ast, {}, code).code;

  // 待办 这里只把code做了替换
  // 每个js文件都需要单独import i18n? 为啥?
  // if (transform && hasLang) {
  //   const { name, objectPattern } = dependency;
  // }

  // 待办 把语言包存到文件 在哪个阶段做这件事? 在每次loader后 写入 还是?
  // 待办 中文包需要通过$t的形式进行变量替换

  // 收集 currentCompileResourceMap
  setCurrentCompileResourceMap(resourcePath, collection, keyInCodes); // create the latest collection to this file in sourcemap variable
  addCompiledFiles(resourcePath);

  // 为什么在plugin中放置

  return newCode;
}

module.exports = simpleLoader;
