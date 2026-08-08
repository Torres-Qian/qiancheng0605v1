"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Search, ArrowLeft, Clock, AlertTriangle, CheckCircle, XCircle, Loader2, Activity } from "lucide-react";

interface TraceEvent {
  id: string;
  eventName: string;
  eventStatus: string;
  message: string;
  occurredAt: string;
  unitId?: string;
  metadata?: unknown;
}

export default function TracesPage() {
  const router = useRouter();
  const [searchType, setSearchType] = useState("traceId");
  const [searchValue, setSearchValue] = useState("");
  const [events, setEvents] = useState<TraceEvent[]>([]);
  const [taskInfo, setTaskInfo] = useState<{ fileName: string; status: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedEvent, setSelectedEvent] = useState<TraceEvent | null>(null);

  const handleSearch = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!searchValue.trim()) return;

    setLoading(true);
    setError("");
    setEvents([]);
    setTaskInfo(null);

    try {
      let url: string;
      if (searchType === "traceId" || searchType === "taskId") {
        url = `/api/traces/${encodeURIComponent(searchValue.trim())}`;
      } else {
        url = `/api/traces/search?${searchType}=${encodeURIComponent(searchValue.trim())}`;
      }

      const res = await fetch(url);
      const data = await res.json();

      if (data.success) {
        setEvents(data.data.events);
        if (data.data.task) {
          setTaskInfo({ fileName: data.data.task.fileName, status: data.data.task.status });
        }
      } else {
        setError(data.error || "未找到相关记录");
      }
    } catch (err: any) {
      setError(err.message || "搜索失败");
    }
    setLoading(false);
  };

  const getStatusIcon = (status: string) => {
    if (status === "SUCCESS") return <CheckCircle size={16} className="text-emerald-500" />;
    if (status === "FAILED") return <XCircle size={16} className="text-red-500" />;
    if (status === "WARNING" || status === "PARTIAL") return <AlertTriangle size={16} className="text-amber-500" />;
    return <Clock size={16} className="text-slate-400" />;
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-5xl mx-auto px-6 py-8">
        <div className="flex items-center gap-3 mb-6">
          <Link href="/" className="flex items-center gap-1 text-slate-500 hover:text-slate-700 transition-colors">
            <ArrowLeft size={18} />
            <span className="text-sm">返回工作台</span>
          </Link>
        </div>

        <div className="flex items-center gap-3 mb-6">
          <Activity size={24} className="text-blue-500" />
          <h1 className="text-2xl font-bold text-slate-900">全链路 Trace 检索</h1>
        </div>

        {/* 搜索表单 */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 mb-6">
          <form onSubmit={handleSearch} className="flex flex-wrap gap-3">
            <select
              value={searchType}
              onChange={(e) => { setSearchType(e.target.value); setSearchValue(""); }}
              className="text-sm border border-slate-200 rounded-xl px-4 py-2.5 bg-white text-slate-700 font-medium"
            >
              <option value="traceId">Trace ID</option>
              <option value="taskId">Task ID</option>
              <option value="fileName">文件名</option>
              <option value="batchIndex">批次号</option>
              <option value="rowNumber">行号</option>
              <option value="errorCode">错误码</option>
            </select>
            <input
              type="text"
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
              placeholder={`输入 ${searchType}...`}
              className="flex-1 text-sm border border-slate-200 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            />
            <button
              type="submit"
              disabled={loading || !searchValue.trim()}
              className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {loading ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
              搜索
            </button>
          </form>
        </div>

        {/* 任务信息 */}
        {taskInfo && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 mb-6 flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center">
              <Activity size={20} className="text-blue-500" />
            </div>
            <div>
              <p className="text-sm text-slate-500">关联任务</p>
              <p className="font-semibold text-slate-900">{taskInfo.fileName}</p>
            </div>
            <span className="ml-auto px-2.5 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-600">
              {taskInfo.status}
            </span>
          </div>
        )}

        {/* 错误提示 */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6 flex items-center gap-3">
            <XCircle size={18} className="text-red-500" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {/* 时间线 */}
        {events.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
            <h2 className="text-lg font-bold text-slate-900 mb-6">事件时间线</h2>
            <div className="relative">
              {/* 时间线 */}
              <div className="absolute left-[19px] top-2 bottom-2 w-0.5 bg-slate-200" />

              <div className="space-y-1">
                {events.map((event, idx) => (
                  <div
                    key={event.id || idx}
                    className="relative pl-12 py-3 cursor-pointer hover:bg-slate-50 rounded-lg transition-colors group"
                    onClick={() => setSelectedEvent(event)}
                  >
                    <div className="absolute left-[12px] top-4 w-4 h-4 rounded-full border-2 border-white shadow-sm bg-white">
                      <div className="absolute inset-0 flex items-center justify-center">
                        {getStatusIcon(event.eventStatus)}
                      </div>
                    </div>

                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm text-slate-800">{event.eventName}</span>
                          {event.eventStatus === "FAILED" && (
                            <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-red-50 text-red-600">失败</span>
                          )}
                          {event.unitId && (
                            <span className="text-xs text-slate-400 font-mono">{event.unitId}</span>
                          )}
                        </div>
                        <p className="text-sm text-slate-500 mt-0.5">{event.message}</p>
                      </div>
                      <span className="text-xs text-slate-400 whitespace-nowrap mt-1 font-mono">
                        {event.occurredAt ? new Date(event.occurredAt).toLocaleTimeString("zh-CN", { hour12: false }) : ""}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* 空状态 */}
        {!loading && !error && events.length === 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-12 text-center">
            <Search size={48} className="mx-auto mb-4 text-slate-300" />
            <p className="text-slate-500">输入 Trace ID 或 Task ID 查看完整的事件时间线</p>
            <p className="text-sm text-slate-400 mt-2">支持按 traceId、taskId、文件名、批次号、行号、错误码搜索</p>
          </div>
        )}
      </div>

      {/* 事件详情弹窗 */}
      {selectedEvent && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setSelectedEvent(null)}>
          <div className="bg-white rounded-2xl shadow-xl p-6 max-w-lg w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-slate-900">事件详情</h3>
              <button onClick={() => setSelectedEvent(null)} className="text-slate-400 hover:text-slate-600">
                <XCircle size={20} />
              </button>
            </div>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">事件名称</span>
                <span className="font-medium">{selectedEvent.eventName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">状态</span>
                <span className={`font-medium ${selectedEvent.eventStatus === "FAILED" ? "text-red-600" : selectedEvent.eventStatus === "SUCCESS" ? "text-emerald-600" : "text-slate-700"}`}>
                  {selectedEvent.eventStatus}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">消息</span>
                <span className="font-medium">{selectedEvent.message}</span>
              </div>
              {selectedEvent.unitId && (
                <div className="flex justify-between">
                  <span className="text-slate-500">处理单元</span>
                  <span className="font-medium font-mono">{selectedEvent.unitId}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-slate-500">时间</span>
                <span className="font-medium font-mono">
                  {selectedEvent.occurredAt ? new Date(selectedEvent.occurredAt).toLocaleString("zh-CN") : ""}
                </span>
              </div>
              {selectedEvent.metadata ? (
                <div className="pt-3 border-t border-slate-100">
                  <span className="text-slate-500">元数据</span>
                  <pre className="mt-1 p-3 bg-slate-50 rounded-lg text-xs overflow-x-auto">
                    {JSON.stringify(selectedEvent.metadata, null, 2)}
                  </pre>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
