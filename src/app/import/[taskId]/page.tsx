"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Copy, Download, AlertTriangle, CheckCircle, Clock, XCircle, Loader2, RefreshCw, FileText, Hash, Activity } from "lucide-react";

interface TaskProgress {
  taskId: string;
  fileName: string;
  traceId: string;
  status: string;
  totalRows: number;
  processedRows: number;
  successRows: number;
  failedRows: number;
  totalBatches: number;
  completedBatches: number;
  degraded: boolean;
  degradedReason?: string;
  throughput?: number;
  estimatedRemaining?: number;
  createdAt: string;
  completedAt?: string;
}

interface ErrorItem {
  id: string;
  batchIndex: number;
  rowNumber: number;
  fieldName: string;
  rawValue: string;
  errorCode: string;
  errorReason: string;
  traceId: string;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  PENDING: { label: "等待处理", color: "text-slate-500", bg: "bg-slate-100" },
  PROCESSING: { label: "处理中", color: "text-blue-600", bg: "bg-blue-50" },
  COMPLETED: { label: "已完成", color: "text-emerald-600", bg: "bg-emerald-50" },
  PARTIAL_SUCCESS: { label: "部分成功", color: "text-amber-600", bg: "bg-amber-50" },
  FAILED: { label: "失败", color: "text-red-600", bg: "bg-red-50" },
};

const ERROR_NAMES: Record<string, string> = {
  E001: "SKU 不存在",
  E002: "必填字段缺失",
  E003: "电话格式错误",
  E004: "数量不是正数",
  E005: "外部编码重复",
  E006: "规则映射失败",
  E007: "数据库写入失败",
  E008: "文件格式不支持",
};

export default function TaskProgressPage() {
  const params = useParams();
  const taskId = params.taskId as string;

  const [progress, setProgress] = useState<TaskProgress | null>(null);
  const [errors, setErrors] = useState<ErrorItem[]>([]);
  const [errorPage, setErrorPage] = useState(1);
  const [errorTotal, setErrorTotal] = useState(0);
  const [errorFilter, setErrorFilter] = useState("");
  const [batchFilter, setBatchFilter] = useState<number | "">("");
  const [loading, setLoading] = useState(true);
  const [selectedError, setSelectedError] = useState<ErrorItem | null>(null);

  const fetchProgress = useCallback(async () => {
    try {
      const res = await fetch(`/api/import-tasks/${taskId}`);
      const data = await res.json();
      if (data.success) setProgress(data.data);
    } catch (err) {
      console.error("获取进度失败:", err);
    }
  }, [taskId]);

  const fetchErrors = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      params.set("page", String(errorPage));
      params.set("page_size", "50");
      if (errorFilter) params.set("error_code", errorFilter);
      if (batchFilter !== "") params.set("batch", String(batchFilter));

      const res = await fetch(`/api/import-tasks/${taskId}/errors?${params}`);
      const data = await res.json();
      if (data.success) {
        setErrors(data.data.errors);
        setErrorTotal(data.data.total);
      }
    } catch (err) {
      console.error("获取错误明细失败:", err);
    }
  }, [taskId, errorPage, errorFilter, batchFilter]);

  useEffect(() => {
    fetchProgress();
    const interval = setInterval(fetchProgress, 2000);
    return () => clearInterval(interval);
  }, [fetchProgress]);

  useEffect(() => {
    fetchErrors();
  }, [fetchErrors]);

  // 当失败数变化或任务进入终态时，重新拉取错误明细
  // 解决：任务刚打开时 errors 表为空，Worker 写入后前端从不刷新的问题
  useEffect(() => {
    if (!progress) return;
    fetchErrors();
  }, [progress?.failedRows, progress?.status, fetchErrors]);

  useEffect(() => {
    if (progress && (progress.status === "COMPLETED" || progress.status === "PARTIAL_SUCCESS" || progress.status === "FAILED")) {
      setLoading(false);
    }
  }, [progress]);

  const status = progress ? STATUS_CONFIG[progress.status] || STATUS_CONFIG.PENDING : STATUS_CONFIG.PENDING;
  const pct = progress && progress.totalRows > 0 ? Math.round((progress.processedRows / progress.totalRows) * 100) : 0;

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* 顶部导航 */}
        <div className="flex items-center gap-3 mb-6">
          <Link href="/import" className="flex items-center gap-1 text-slate-500 hover:text-slate-700 transition-colors">
            <ArrowLeft size={18} />
            <span className="text-sm">返回导入</span>
          </Link>
        </div>

        {/* 降级警告横幅 */}
        {progress?.degraded && (
          <div className="mb-6 p-4 rounded-xl bg-amber-50 border border-amber-200 flex items-start gap-3">
            <AlertTriangle className="text-amber-500 mt-0.5 shrink-0" size={20} />
            <div>
              <p className="font-semibold text-amber-800">SKU 校验已降级</p>
              <p className="text-sm text-amber-600 mt-1">
                {progress.degradedReason || "本次导入未经过商品主数据完整校验，数据可能需要后续复核。"}
              </p>
            </div>
          </div>
        )}

        {/* 顶部状态栏 */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 mb-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${status.bg}`}>
                {progress?.status === "COMPLETED" ? (
                  <CheckCircle size={24} className={status.color} />
                ) : progress?.status === "FAILED" ? (
                  <XCircle size={24} className={status.color} />
                ) : progress?.status === "PARTIAL_SUCCESS" ? (
                  <AlertTriangle size={24} className={status.color} />
                ) : (
                  <Loader2 size={24} className={`${status.color} animate-spin`} />
                )}
              </div>
              <div>
                <h1 className="text-xl font-bold text-slate-900">{progress?.fileName || "加载中..."}</h1>
                <div className="flex items-center gap-4 mt-1 text-sm text-slate-500">
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${status.bg} ${status.color}`}>
                    {status.label}
                  </span>
                  <button onClick={() => copyToClipboard(taskId)} className="flex items-center gap-1 hover:text-slate-700">
                    <Hash size={12} />
                    <span className="font-mono text-xs">{taskId?.substring(0, 16)}...</span>
                    <Copy size={12} />
                  </button>
                  {progress?.traceId && (
                    <Link href={`/traces?traceId=${progress.traceId}`} className="flex items-center gap-1 text-blue-500 hover:text-blue-700">
                      <Activity size={12} />
                      <span className="font-mono text-xs">Trace</span>
                    </Link>
                  )}
                </div>
              </div>
            </div>
            <button
              onClick={fetchProgress}
              className="flex items-center gap-1 px-3 py-1.5 text-sm text-slate-500 hover:text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
            >
              <RefreshCw size={14} />
              刷新
            </button>
          </div>
        </div>

        {/* 进度概览卡片 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <StatCard label="总行数" value={progress?.totalRows || 0} icon={<FileText size={20} />} color="text-blue-600" bg="bg-blue-50" />
          <StatCard label="已处理" value={progress?.processedRows || 0} icon={<RefreshCw size={20} />} color="text-indigo-600" bg="bg-indigo-50" />
          <StatCard label="成功" value={progress?.successRows || 0} icon={<CheckCircle size={20} />} color="text-emerald-600" bg="bg-emerald-50" />
          <StatCard label="失败" value={progress?.failedRows || 0} icon={<XCircle size={20} />} color="text-red-600" bg="bg-red-50" />
        </div>

        {/* 进度条和吞吐量 */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 mb-6">
          <div className="mb-4">
            <div className="flex justify-between text-sm mb-2">
              <span className="text-slate-600 font-medium">处理进度</span>
              <span className="text-slate-400">{pct}%</span>
            </div>
            <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-blue-500 to-blue-600 rounded-full transition-all duration-500 ease-out"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-6 text-sm">
            <div>
              <span className="text-slate-400">批次进度</span>
              <span className="ml-2 font-semibold text-slate-700">
                {progress?.completedBatches || 0} / {progress?.totalBatches || 0}
              </span>
            </div>
            <div>
              <span className="text-slate-400">吞吐量</span>
              <span className="ml-2 font-semibold text-slate-700">{progress?.throughput || 0} 行/秒</span>
            </div>
            <div>
              <span className="text-slate-400">预计剩余</span>
              <span className="ml-2 font-semibold text-slate-700">{progress?.estimatedRemaining || 0} 秒</span>
            </div>
            {progress?.degraded && (
              <div>
                <span className="text-amber-500 font-medium flex items-center gap-1">
                  <AlertTriangle size={14} />
                  校验已降级
                </span>
              </div>
            )}
          </div>
        </div>

        {/* 错误明细 */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-slate-900">错误明细</h2>
            <div className="flex items-center gap-3">
              <button
                onClick={async () => {
                  try {
                    const allParams = new URLSearchParams();
                    allParams.set("page", "1");
                    allParams.set("page_size", String(errorTotal || 10000));
                    if (errorFilter) allParams.set("error_code", errorFilter);
                    if (batchFilter !== "") allParams.set("batch", String(batchFilter));
                    const res = await fetch(`/api/import-tasks/${taskId}/errors?${allParams}`);
                    const data = await res.json();
                    if (data.success && data.data.errors.length > 0) {
                      const csv = [
                        ["批次", "行号", "字段", "错误码", "错误原因", "原始值"].join(","),
                        ...data.data.errors.map((e: ErrorItem) =>
                          [e.batchIndex + 1, e.rowNumber, e.fieldName, e.errorCode, `"${e.errorReason.replace(/"/g, '""')}"`, `"${(e.rawValue || "").replace(/"/g, '""')}"`].join(",")
                        )
                      ].join("\n");
                      const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = `errors-${taskId?.substring(0, 8)}.csv`;
                      a.click();
                      URL.revokeObjectURL(url);
                    }
                  } catch { /* ignore */ }
                }}
                disabled={errorTotal === 0}
                className="flex items-center gap-1 px-3 py-1.5 text-sm text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <Download size={14} />
                导出CSV
              </button>
              <select
                value={batchFilter}
                onChange={(e) => { setBatchFilter(e.target.value ? Number(e.target.value) : ""); setErrorPage(1); }}
                className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white text-slate-600"
              >
                <option value="">全部批次</option>
                {progress && Array.from({ length: progress.totalBatches }, (_, i) => (
                  <option key={i} value={i}>批次 {i + 1}</option>
                ))}
              </select>
              <select
                value={errorFilter}
                onChange={(e) => { setErrorFilter(e.target.value); setErrorPage(1); }}
                className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white text-slate-600"
              >
                <option value="">全部类型</option>
                {Object.entries(ERROR_NAMES).map(([code, name]) => (
                  <option key={code} value={code}>{code} - {name}</option>
                ))}
              </select>
            </div>
          </div>

          {errors.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <CheckCircle size={40} className="mx-auto mb-3 text-emerald-400" />
              <p>暂无错误记录</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100">
                      <th className="text-left py-3 px-3 text-slate-500 font-medium">批次</th>
                      <th className="text-left py-3 px-3 text-slate-500 font-medium">行号</th>
                      <th className="text-left py-3 px-3 text-slate-500 font-medium">字段</th>
                      <th className="text-left py-3 px-3 text-slate-500 font-medium">原始值</th>
                      <th className="text-left py-3 px-3 text-slate-500 font-medium">错误码</th>
                      <th className="text-left py-3 px-3 text-slate-500 font-medium">原因</th>
                    </tr>
                  </thead>
                  <tbody>
                    {errors.map((err) => (
                      <tr
                        key={err.id}
                        onClick={() => setSelectedError(err)}
                        className="border-b border-slate-50 hover:bg-slate-50 cursor-pointer transition-colors"
                      >
                        <td className="py-2.5 px-3 font-mono text-slate-500">#{err.batchIndex + 1}</td>
                        <td className="py-2.5 px-3 font-mono text-slate-700">{err.rowNumber}</td>
                        <td className="py-2.5 px-3 text-slate-600">{err.fieldName}</td>
                        <td className="py-2.5 px-3 font-mono text-slate-700 max-w-[200px] truncate" title={err.rawValue || ""}>
                          {err.rawValue ? err.rawValue : <span className="text-slate-300">—</span>}
                        </td>
                        <td className="py-2.5 px-3">
                          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-600">
                            {err.errorCode}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-slate-600 max-w-xs truncate">{err.errorReason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* 分页 */}
              {errorTotal > 50 && (
                <div className="flex items-center justify-between mt-4 pt-4 border-t border-slate-100">
                  <span className="text-sm text-slate-500">共 {errorTotal} 条</span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setErrorPage((p) => Math.max(1, p - 1))}
                      disabled={errorPage === 1}
                      className="px-3 py-1 text-sm border border-slate-200 rounded-lg disabled:opacity-40 hover:bg-slate-50"
                    >
                      上一页
                    </button>
                    <span className="text-sm text-slate-500">第 {errorPage} 页</span>
                    <button
                      onClick={() => setErrorPage((p) => p + 1)}
                      disabled={errorPage * 50 >= errorTotal}
                      className="px-3 py-1 text-sm border border-slate-200 rounded-lg disabled:opacity-40 hover:bg-slate-50"
                    >
                      下一页
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* 错误详情弹窗 */}
      {selectedError && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setSelectedError(null)}>
          <div className="bg-white rounded-2xl shadow-xl p-6 max-w-lg w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-slate-900">错误详情</h3>
              <button onClick={() => setSelectedError(null)} className="text-slate-400 hover:text-slate-600">
                <XCircle size={20} />
              </button>
            </div>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">批次号</span>
                <span className="font-medium">#{selectedError.batchIndex + 1}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">行号</span>
                <span className="font-medium font-mono">{selectedError.rowNumber}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">字段名</span>
                <span className="font-medium">{selectedError.fieldName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">原始值</span>
                <span className="font-medium font-mono max-w-[200px] truncate">{selectedError.rawValue || "-"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">错误码</span>
                <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-600">{selectedError.errorCode}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">错误原因</span>
                <span className="font-medium text-red-600">{selectedError.errorReason}</span>
              </div>
              <div className="pt-3 border-t border-slate-100">
                <p className="text-slate-500 mb-1">建议修复方式</p>
                <p className="text-slate-700 text-sm">
                  {selectedError.errorCode === "E001" && "请确认 SKU 编码是否正确，或在商品主数据中添加该 SKU。"}
                  {selectedError.errorCode === "E002" && "请在文件中补充缺失的必填字段值。"}
                  {selectedError.errorCode === "E003" && "请使用正确的 11 位手机号码格式。"}
                  {selectedError.errorCode === "E004" && "SKU 数量必须大于 0。"}
                  {selectedError.errorCode === "E005" && "请检查外部编码是否与其他记录重复。"}
                  {selectedError.errorCode === "E006" && "请检查解析规则中的字段映射配置。"}
                  {selectedError.errorCode === "E007" && "请重试或联系管理员检查数据库状态。"}
                  {selectedError.errorCode === "E008" && "请使用支持的 Excel/Word/PDF 格式文件。"}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, icon, color, bg }: { label: string; value: number; icon: React.ReactNode; color: string; bg: string }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 flex items-center gap-3">
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${bg}`}>
        <span className={color}>{icon}</span>
      </div>
      <div>
        <p className="text-xs text-slate-500">{label}</p>
        <p className="text-xl font-bold text-slate-900">{value.toLocaleString()}</p>
      </div>
    </div>
  );
}
