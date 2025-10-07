<template>
  <div>
    <button @click="exportExcelWithFilter">导出带筛选的Excel</button>

    <!-- 数据预览 -->
    <table v-if="showPreview" class="preview-table">
      <thead>
        <tr>
          <th v-for="header in headers" :key="header">{{ header }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(item, index) in tableData" :key="index">
          <td v-for="header in headers" :key="header">{{ item[header] }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup>
import { ref } from "vue";
import * as XLSX from "xlsx";

// 响应式数据
const showPreview = ref(true);
const headers = ref(["产品名称", "产品类型", "数量", "价格", "备注"]);
const tableData = ref([
  {
    产品名称: "产品A",
    产品类型: "样品",
    数量: 10,
    价格: 100,
    备注: "测试样品",
  },
  {
    产品名称: "产品B",
    产品类型: "成品",
    数量: 20,
    价格: 200,
    备注: "正式产品",
  },
  { 产品名称: "产品C", 产品类型: "样品", 数量: 5, 价格: 50, 备注: "展示样品" },
  {
    产品名称: "产品D",
    产品类型: "成品",
    数量: 30,
    价格: 300,
    备注: "热销产品",
  },
]);

// 导出带筛选功能的Excel
const exportExcelWithFilter = () => {
  // 创建工作簿
  const wb = XLSX.utils.book_new();

  // 准备工作表数据（二维数组格式）
  const wsData = [
    headers.value, // 表头行
    ...tableData.value.map((item) => [
      item["产品名称"],
      item["产品类型"],
      item["数量"],
      item["价格"],
      item["备注"],
    ]),
  ];

  // 创建工作表
  const ws = XLSX.utils.aoa_to_sheet(wsData);

  // 添加自动筛选（A1:E1是表头范围）
  ws["!autofilter"] = {
    ref: `A1:${String.fromCharCode(64 + headers.value.length)}${wsData.length}`,
  };

  // 可选：冻结首行
  ws["!views"] = [{ state: "frozen", ySplit: 1 }];

  // 可选：设置列宽
  ws["!cols"] = [
    { wch: 20 }, // 产品名称
    { wch: 10 }, // 产品类型
    { wch: 10 }, // 数量
    { wch: 10 }, // 价格
    { wch: 30 }, // 备注
  ];

  // 将工作表添加到工作簿
  XLSX.utils.book_append_sheet(wb, ws, "产品数据");

  // 生成Excel文件并下载
  XLSX.writeFile(wb, "产品数据(带筛选).xlsx");
};
</script>

<style scoped>
button {
  padding: 8px 16px;
  background-color: #42b983;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  margin-bottom: 20px;
  font-size: 14px;
}

button:hover {
  background-color: #3aa373;
}

.preview-table {
  width: 100%;
  border-collapse: collapse;
  margin-top: 20px;
  font-size: 14px;
}

.preview-table th,
.preview-table td {
  border: 1px solid #ddd;
  padding: 8px 12px;
  text-align: left;
}

.preview-table th {
  background-color: #f2f2f2;
  position: sticky;
  top: 0;
}

.preview-table tr:nth-child(even) {
  background-color: #f9f9f9;
}

.preview-table tr:hover {
  background-color: #f1f1f1;
}
</style>
