module.exports = {
  plugins: {
    "postcss-pxtorem": {
      rootValue: 51.2, // 设计稿宽度的一半，比如设计稿是750px，则设置为37.5
      propList: ["*"], // 需要转换的属性，这里选择全部都进行转换
      selectorBlackList: [], // 过滤掉不需要转换的选择器
    },
  },
};
