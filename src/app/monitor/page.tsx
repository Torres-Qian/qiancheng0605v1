"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell, Legend,
} from "recharts";
import { ArrowLeft, RefreshCw, TrendingUp, AlertTriangle, Clock, BarChart3, Activity, Database, Layers } from "lucide-react";

interface MonitorData {
  throughput: { minute: string; rows: number }[];
  queueDepth: { pendingBatches: number; pendingRows: number; status: string; threshold: number };
  stageLatency: {
    parse: { p50: number; p95: number; p99: number };
    validate: { p50: number; p95: number; p99: number };
    insert: { p50: number; p95: number; p99: number };
  };
  errorDistribution: { errorCode: string; errorName: string; count: number; percentage: number }[];
  slowBatches: { taskId: string; unitId: string; batchIndex: number; totalDurationMs: number; parseDurationMs: number; validateDurationMs: number; insertDurationMs: number; rowCount: number }[];
}

const ERROR_COLORS: Record<string, string> = {
  E001: "#EF4444",
  E002: "#F59E0B",
  E003: "#8B5CF6",
  E004: "#3B82F6",
  E005: "#EC4899",
  E006: "#10B981",
  E007: "#6366F1",
  E008: "#F97316",
};

const COLORS = ["#EF4444", "#F59E0B", "#8B5CF6", "#3B82F6", "#EC4899", "#10B981", "#6366F1", "#F97316"];

export default function MonitorPage() {
  const [data, setData] = useState<MonitorData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/import-monitor/summary");
      const json = await res.json();
      if (json.success) setData(json.data);
    } catch (err) {
      console.error("获取监控数据失败:", err);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const queueColor = data?.queueDepth.status === "critical" ? "text-red-500" : data?.queueDepth.status === "warning" ? "text-amber-500" : "text-emerald-500";

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-1 text-slate-500 hover:text-slate-700 transition-colors">
              <ArrowLeft size={18} />
              <span className="text-sm">返回工作台</span>
            </Link>
          </div>
          <button
            onClick={fetchData}
            className="flex items-center gap-1 px-3 py-1.5 text-sm text-slate-500 hover:text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
          >
            <RefreshCw size={14} />
            刷新
          </button>
        </div>

        <h1 className="text-2xl font-bold text-slate-900 mb-6">导入监控看板</h1>

        {loading && (
          <div className="flex items-center justify-center py-20">
            <RefreshCw size={32} className="text-slate-300 animate-spin" />
          </div>
        )}

        {data && (
          <>
            {/* 概览指标 */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <MiniCard
                icon={<TrendingUp size={20} />}
                label="实时吞吐量"
                value={data.throughput.length > 0 ? `${data.throughput[data.throughput.length - 1]?.rows || 0} 行/分` : "暂无数据"}
                color="text-blue-600"
                bg="bg-blue-50"
              />
              <MiniCard
                icon={<Layers size={20} />}
                label="队列积压"
                value={`${data.queueDepth.pendingBatches} 批`}
                color={queueColor}
                bg={data.queueDepth.status === "critical" ? "bg-red-50" : data.queueDepth.status === "warning" ? "bg-amber-50" : "bg-emerald-50"}
              />
              <MiniCard
                icon={<Clock size={20} />}
                label="校验 P95"
                value={`${data.stageLatency.validate.p95}ms`}
                color="text-amber-600"
                bg="bg-amber-50"
              />
              <MiniCard
                icon={<Database size={20} />}
                label="写入 P95"
                value={`${data.stageLatency.insert.p95}ms`}
                color="text-purple-600"
                bg="bg-purple-50"
              />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
              {/* 实时吞吐量 */}
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
                  <TrendingUp size={18} className="text-blue-500" />
                  实时吞吐量
                </h3>
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={data.throughput}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                    <XAxis dataKey="minute" tick={{ fontSize: 12, fill: "#94A3B8" }} />
                    <YAxis tick={{ fontSize: 12, fill: "#94A3B8" }} />
                    <Tooltip
                      contentStyle={{ borderRadius: 12, border: "1px solid #E2E8F0" }}
                    />
                    <Line type="monotone" dataKey="rows" stroke="#3B82F6" strokeWidth={2} dot={{ fill: "#3B82F6", r: 3 }} name="行数/分钟" />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* 阶段耗时分布 */}
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
                  <BarChart3 size={18} className="text-indigo-500" />
                  阶段耗时分布 (P50 / P95 / P99)
                </h3>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart
                    data={[
                      { name: "解析", p50: data.stageLatency.parse.p50, p95: data.stageLatency.parse.p95, p99: data.stageLatency.parse.p99 },
                      { name: "校验", p50: data.stageLatency.validate.p50, p95: data.stageLatency.validate.p95, p99: data.stageLatency.validate.p99 },
                      { name: "写入", p50: data.stageLatency.insert.p50, p95: data.stageLatency.insert.p95, p99: data.stageLatency.insert.p99 },
                    ]}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                    <XAxis dataKey="name" tick={{ fontSize: 12, fill: "#94A3B8" }} />
                    <YAxis tick={{ fontSize: 12, fill: "#94A3B8" }} unit="ms" />
                    <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #E2E8F0" }} />
                    <Legend />
                    <Bar dataKey="p50" fill="#10B981" name="P50" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="p95" fill="#F59E0B" name="P95" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="p99" fill="#EF4444" name="P99" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
              {/* 错误类型分布 */}
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
                  <AlertTriangle size={18} className="text-red-500" />
                  错误类型分布
                </h3>
                {data.errorDistribution.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie
                        data={data.errorDistribution}
                        cx="50%"
                        cy="50%"
                        outerRadius={100}
                        dataKey="count"
                        nameKey="errorCode"
                        label={({ errorCode, percentage }) => `${errorCode} ${percentage}%`}
                      >
                        {data.errorDistribution.map((entry, index) => (
                          <Cell key={entry.errorCode} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(value: number, _name: string, entry: any) => [
                          `${value} 条 (${entry.payload.percentage}%)`,
                          entry.payload.errorName,
                        ]}
                        contentStyle={{ borderRadius: 12, border: "1px solid #E2E8F0" }}
                      />
                      <Legend formatter={(value: string) => `${value} - ${data.errorDistribution.find(e => e.errorCode === value)?.errorName || ""}`} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="text-center py-16 text-slate-400">
                    <CheckCircleIcon />
                    <p className="mt-2">暂无错误记录</p>
                  </div>
                )}
              </div>

              {/* 慢批次 TOP 10 */}
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
                  <Clock size={18} className="text-amber-500" />
                  慢批次 TOP 10
                </h3>
                {data.slowBatches.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-100">
                          <th className="text-left py-2 px-2 text-slate-500 font-medium">批次</th>
                          <th className="text-right py-2 px-2 text-slate-500 font-medium">总耗时</th>
                          <th className="text-right py-2 px-2 text-slate-500 font-medium">解析</th>
                          <th className="text-right py-2 px-2 text-slate-500 font-medium">校验</th>
                          <th className="text-right py-2 px-2 text-slate-500 font-medium">写入</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.slowBatches.map((b, i) => (
                          <tr key={i} className="border-b border-slate-50 hover:bg-slate-50">
                            <td className="py-2 px-2 font-mono text-slate-600">#{b.batchIndex + 1}</td>
                            <td className="py-2 px-2 text-right font-semibold text-slate-700">{b.totalDurationMs}ms</td>
                            <td className="py-2 px-2 text-right text-slate-500">{b.parseDurationMs}ms</td>
                            <td className="py-2 px-2 text-right text-slate-500">{b.validateDurationMs}ms</td>
                            <td className="py-2 px-2 text-right text-slate-500">{b.insertDurationMs}ms</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="text-center py-16 text-slate-400">暂无数据</div>
                )}
              </div>
            </div>

            {/* 队列积压详情 */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
              <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
                <Layers size={18} className="text-indigo-500" />
                队列积压深度
              </h3>
              <div className="flex items-center gap-8">
                <div>
                  <p className="text-sm text-slate-500">待处理批次</p>
                  <p className="text-3xl font-bold text-slate-900">{data.queueDepth.pendingBatches}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-500">预估待处理行数</p>
                  <p className="text-3xl font-bold text-slate-900">{data.queueDepth.pendingRows.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-500">告警阈值</p>
                  <p className="text-3xl font-bold text-slate-900">{data.queueDepth.threshold.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-500">状态</p>
                  <span className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${
                    data.queueDepth.status === "critical" ? "bg-red-50 text-red-600" :
                    data.queueDepth.status === "warning" ? "bg-amber-50 text-amber-600" :
                    "bg-emerald-50 text-emerald-600"
                  }`}>
                    {data.queueDepth.status === "critical" ? "严重" : data.queueDepth.status === "warning" ? "预警" : "正常"}
                  </span>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function MiniCard({ icon, label, value, color, bg }: { icon: React.ReactNode; label: string; value: string; color: string; bg: string }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 flex items-center gap-3">
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${bg}`}>
        <span className={color}>{icon}</span>
      </div>
      <div>
        <p className="text-xs text-slate-500">{label}</p>
        <p className="text-lg font-bold text-slate-900">{value}</p>
      </div>
    </div>
  );
}

function CheckCircleIcon() {
  return (
    <svg className="mx-auto" width="40" height="40" viewBox="0 0 40 40" fill="none">
      <circle cx="20" cy="20" r="20" fill="#ECFDF5" />
      <path d="M12 20L18 26L28 14" stroke="#10B981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
