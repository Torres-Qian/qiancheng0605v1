// Create a standard rule for the 10000-order pressure test file
const config = {
  version: "1.0",
  skipRows: { top: 0, bottom: 0 },
  headerRow: 1,
  sheetMode: "first",
  dataStartRow: 2,
  dataEndMode: "auto",
  fieldMapping: {
    externalCode: { source: "column", value: "外部编码" },
    recipientStore: { source: "column", value: "收货门店" },
    recipientName: { source: "column", value: "收件人姓名" },
    recipientPhone: { source: "column", value: "收件人电话" },
    recipientAddress: { source: "column", value: "收件人地址" },
    skuCode: { source: "column", value: "SKU编码" },
    skuName: { source: "column", value: "SKU名称" },
    skuQuantity: { source: "column", value: "SKU数量" },
    skuSpec: { source: "column", value: "SKU规格" },
    remark: { source: "column", value: "备注" },
  },
  aggregation: { enabled: false, groupBy: [], aggregations: {} },
  matrixTransform: null,
  cardDetection: null,
  cellSplitConfig: null,
  multiOrderSplit: null,
  skipRowsPattern: "",
  defaultValues: {},
  postProcessors: [],
};

async function main() {
  const res = await fetch("http://localhost:3000/api/rules", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "压测标准规则-10000行",
      description: "针对 10000-orders.xlsx 的标准列映射规则",
      fileType: "excel",
      ruleConfig: config,
      createdBy: "manual",
    }),
  });
  const data = await res.json();
  console.log(JSON.stringify(data, null, 2));
}
main().catch((e) => { console.error(e); process.exit(1); });
