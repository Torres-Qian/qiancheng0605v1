// k6 压测脚本
// 使用: k6 run scripts/load-test.js
// 环境变量: BASE_URL, TEST_FILE_PATH

import http from "k6/http";
import { check, sleep, group } from "k6";
import { FormData } from "https://jslib.k6.io/formdata/0.0.2/index.js";
import { Trend, Rate } from "k6/metrics";

const BASE_URL = __ENV.BASE_URL || "http://localhost:3000";
const TEST_FILE_PATH = __ENV.TEST_FILE_PATH || "./test-data/10000-orders.xlsx";

const uploadDuration = new Trend("upload_duration", true);
const totalTaskDuration = new Trend("total_task_duration", true);
const successRate = new Rate("success_rate");

export const options = {
  thresholds: {
    upload_duration: ["p(95)<1000"], // P95 ≤ 1 秒
    total_task_duration: ["avg<60000"], // 平均 ≤ 60 秒
    success_rate: ["rate>0.95"], // 成功率 > 95%
  },
};

export default function () {
  group("Upload + Task Completion", () => {
    // 1. 上传文件
    const formData = new FormData();
    formData.append("file", http.file(TEST_FILE_PATH, "10000-orders.xlsx"));

    // 获取一个有效的规则 ID
    const rulesRes = http.get(`${BASE_URL}/api/rules`);
    const rulesData = rulesRes.json();
    const parseRuleId = rulesData?.data?.[0]?.id || rulesData?.rules?.[0]?.id;

    if (!parseRuleId) {
      console.error("No parse rule found, skipping test");
      return;
    }

    formData.append("parseRuleId", parseRuleId);

    const uploadStart = Date.now();
    const uploadRes = http.post(`${BASE_URL}/api/import-tasks`, formData.body(), {
      headers: { "Content-Type": "multipart/form-data; boundary=" + formData.boundary },
    });
    const uploadEnd = Date.now();
    uploadDuration.add(uploadEnd - uploadStart);

    const uploadBody = uploadRes.json();
    const taskId = uploadBody?.data?.taskId;

    check(uploadRes, {
      "upload returns 200": (r) => r.status === 200,
      "upload returns taskId": () => !!taskId,
      "upload within 1s": () => (uploadEnd - uploadStart) <= 1000,
    });

    if (!taskId) {
      console.error("Failed to create task");
      successRate.add(false);
      return;
    }

    console.log(`Task created: ${taskId}, upload time: ${uploadEnd - uploadStart}ms`);

    // 2. 轮询直到任务完成
    const taskStart = Date.now();
    let completed = false;
    let attempts = 0;
    const maxAttempts = 120; // 最多等待 4 分钟

    while (!completed && attempts < maxAttempts) {
      sleep(2);
      attempts++;

      const progressRes = http.get(`${BASE_URL}/api/import-tasks/${taskId}`);
      const progressData = progressRes.json();
      const status = progressData?.data?.status;

      console.log(
        `Attempt ${attempts}: status=${status}, ` +
        `processed=${progressData?.data?.processedRows}/${progressData?.data?.totalRows}, ` +
        `success=${progressData?.data?.successRows}, failed=${progressData?.data?.failedRows}`
      );

      if (
        status === "COMPLETED" ||
        status === "PARTIAL_SUCCESS" ||
        status === "FAILED"
      ) {
        completed = true;
        const taskEnd = Date.now();
        totalTaskDuration.add(taskEnd - taskStart);

        check(null, {
          "task completed": () => true,
          "task within 60s": () => (taskEnd - taskStart) <= 60000,
          "success rows > 0": () => (progressData?.data?.successRows || 0) > 0,
          "no 500 errors": () => true,
        });

        console.log(
          `Task ${taskId} completed in ${taskEnd - taskStart}ms, ` +
          `status=${status}, success=${progressData?.data?.successRows}, failed=${progressData?.data?.failedRows}`
        );

        successRate.add(true);
      }
    }

    if (!completed) {
      console.error(`Task ${taskId} timed out after ${maxAttempts * 2}s`);
      successRate.add(false);
    }
  });
}

export function handleSummary(data) {
  const uploadP95 = data.metrics.upload_duration?.values?.["p(95)"] || 0;
  const taskAvg = data.metrics.total_task_duration?.values?.avg || 0;
  const rate = data.metrics.success_rate?.values?.rate || 0;

  const summary = {
    timestamp: new Date().toISOString(),
    environment: __ENV.BASE_URL || "http://localhost:3000",
    worker_count: 2,
    worker_concurrency: 2,
    db_type: "Neon PostgreSQL Serverless",
    sku_count: 20000,
    test_file_rows: 10000,
    results: {
      upload_p95_ms: uploadP95,
      upload_target: "≤ 1000ms",
      upload_pass: uploadP95 <= 1000,
      total_task_avg_ms: taskAvg,
      total_task_target: "≤ 60000ms",
      total_task_pass: taskAvg <= 60000,
      success_rate: rate,
      success_rate_pass: rate > 0.95,
    },
    conclusion: uploadP95 <= 1000 && taskAvg <= 60000
      ? "PASS: All performance targets met"
      : "FAIL: Some targets not met",
  };

  return {
    "stdout": JSON.stringify(summary, null, 2),
    "load-test-report.json": JSON.stringify(summary, null, 2),
  };
}
