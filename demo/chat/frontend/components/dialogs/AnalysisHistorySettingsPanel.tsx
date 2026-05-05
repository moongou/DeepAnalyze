"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Activity, AlertTriangle, Clock3, Database, History, Loader2, RefreshCw, ShieldCheck, Workflow } from "lucide-react";

export interface AnalysisHistorySettings {
  enabled: boolean;
  capture_stream_progress: boolean;
  capture_prompt_preview: boolean;
  max_runs: number;
  stream_progress_chunk_interval: number;
  stream_progress_char_interval: number;
}

export interface AnalysisHistoryRunSummary {
  run_id: string;
  session_id: string;
  username?: string;
  status: string;
  started_at: string;
  updated_at?: string;
  duration_ms?: number;
  event_count?: number;
  last_stage?: string;
  last_event?: string;
  last_message?: string;
  last_problem?: string;
  request_summary?: {
    analysis_mode?: string;
    analysis_language?: string;
    strategy?: string;
    report_types?: string[];
    active_database_sources?: Array<{ label?: string; db_type?: string }>;
    model_provider?: { model?: string; providerType?: string; label?: string };
  };
}

export interface AnalysisHistoryEvent {
  run_id: string;
  sequence: number;
  timestamp: string;
  elapsed_ms?: number;
  stage: string;
  event: string;
  status: string;
  message?: string;
  details?: Record<string, unknown>;
}

interface AnalysisHistoryStats {
  total: number;
  completed: number;
  failed: number;
  warning: number;
}

interface AnalysisHistorySettingsPanelProps {
  settings: AnalysisHistorySettings;
  setSettings: (updater: (prev: AnalysisHistorySettings) => AnalysisHistorySettings) => void;
  runs: AnalysisHistoryRunSummary[];
  stats: AnalysisHistoryStats;
  selectedRun: AnalysisHistoryRunSummary | null;
  events: AnalysisHistoryEvent[];
  isLoading: boolean;
  isLoadingDetail: boolean;
  isSaving: boolean;
  onRefresh: () => void;
  onSave: () => void;
  onSelectRun: (runId: string) => void;
}

const statusTone: Record<string, string> = {
  completed: "text-emerald-700 bg-emerald-50 border-emerald-200 dark:text-emerald-300 dark:bg-emerald-950/40 dark:border-emerald-900",
  failed: "text-rose-700 bg-rose-50 border-rose-200 dark:text-rose-300 dark:bg-rose-950/40 dark:border-rose-900",
  warning: "text-amber-700 bg-amber-50 border-amber-200 dark:text-amber-300 dark:bg-amber-950/40 dark:border-amber-900",
  running: "text-cyan-700 bg-cyan-50 border-cyan-200 dark:text-cyan-300 dark:bg-cyan-950/40 dark:border-cyan-900",
  info: "text-slate-700 bg-slate-50 border-slate-200 dark:text-slate-300 dark:bg-slate-900 dark:border-slate-800",
};

function formatDuration(durationMs?: number) {
  const value = Number(durationMs || 0);
  if (!Number.isFinite(value) || value <= 0) return "-";
  if (value < 1000) return `${value} ms`;
  const seconds = value / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)} s`;
  return `${(seconds / 60).toFixed(1)} min`;
}

function formatDateTime(value?: string) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("zh-CN", { hour12: false });
}

function formatDetailJson(details?: Record<string, unknown>) {
  if (!details || Object.keys(details).length === 0) return "";
  try {
    return JSON.stringify(details, null, 2);
  } catch {
    return "";
  }
}

export function AnalysisHistorySettingsPanel({
  settings,
  setSettings,
  runs,
  stats,
  selectedRun,
  events,
  isLoading,
  isLoadingDetail,
  isSaving,
  onRefresh,
  onSave,
  onSelectRun,
}: AnalysisHistorySettingsPanelProps) {
  const selectedRequestSummary = selectedRun?.request_summary;

  return (
    <div className="mt-4 flex-1 overflow-y-auto space-y-6">
      <section className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden bg-white dark:bg-gray-950">
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 bg-[linear-gradient(120deg,rgba(15,23,42,1),rgba(3,105,161,0.92))] text-white">
          <div>
            <div className="text-sm font-semibold flex items-center gap-2">
              <History className="h-4 w-4" />
              分析历史与过程追踪
            </div>
            <div className="text-xs text-cyan-100/90 mt-1">
              按步骤记录每次分析的提示词装配、LLM 响应、代码执行、报告生成与异常位置，用于排查卡顿、评估性能和复盘分析质量。
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={onRefresh} disabled={isLoading}>
              {isLoading ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-2 h-3.5 w-3.5" />}
              刷新记录
            </Button>
            <Button size="sm" onClick={onSave} disabled={isSaving}>
              {isSaving ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : null}
              保存历史设置
            </Button>
          </div>
        </div>

        <div className="p-4 grid grid-cols-2 gap-4">
          <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-4 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-medium">启用详细记录</div>
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">每次分析启动新 run，并在执行过程中持续落盘。</div>
              </div>
              <Switch checked={settings.enabled} onCheckedChange={(checked) => setSettings((prev) => ({ ...prev, enabled: Boolean(checked) }))} />
            </div>

            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-medium">记录流式进度</div>
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">按 chunk/字符里程碑记录 LLM 输出推进情况，方便定位“停在生成中”的位置。</div>
              </div>
              <Switch checked={settings.capture_stream_progress} onCheckedChange={(checked) => setSettings((prev) => ({ ...prev, capture_stream_progress: Boolean(checked) }))} />
            </div>

            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-medium">记录提示词预览</div>
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">保留系统提示词截断预览，用于判断分析策略、上下文注入与提示词膨胀是否合理。</div>
              </div>
              <Switch checked={settings.capture_prompt_preview} onCheckedChange={(checked) => setSettings((prev) => ({ ...prev, capture_prompt_preview: Boolean(checked) }))} />
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-4 grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="analysis-history-max-runs">保留 run 数量</Label>
              <Input
                id="analysis-history-max-runs"
                type="number"
                min={10}
                value={settings.max_runs}
                onChange={(event) => setSettings((prev) => ({ ...prev, max_runs: Math.max(10, Number(event.target.value || prev.max_runs)) }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="analysis-history-chunk-interval">流式 chunk 间隔</Label>
              <Input
                id="analysis-history-chunk-interval"
                type="number"
                min={5}
                value={settings.stream_progress_chunk_interval}
                onChange={(event) => setSettings((prev) => ({ ...prev, stream_progress_chunk_interval: Math.max(5, Number(event.target.value || prev.stream_progress_chunk_interval)) }))}
              />
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label htmlFor="analysis-history-char-interval">流式字符间隔</Label>
              <Input
                id="analysis-history-char-interval"
                type="number"
                min={200}
                value={settings.stream_progress_char_interval}
                onChange={(event) => setSettings((prev) => ({ ...prev, stream_progress_char_interval: Math.max(200, Number(event.target.value || prev.stream_progress_char_interval)) }))}
              />
            </div>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-4 gap-3">
        <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-4 bg-white dark:bg-gray-950">
          <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2"><Activity className="h-3.5 w-3.5" /> 总 run</div>
          <div className="text-2xl font-semibold mt-2">{stats.total}</div>
        </div>
        <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-4 bg-white dark:bg-gray-950">
          <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2"><ShieldCheck className="h-3.5 w-3.5" /> 完成</div>
          <div className="text-2xl font-semibold mt-2">{stats.completed}</div>
        </div>
        <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-4 bg-white dark:bg-gray-950">
          <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2"><AlertTriangle className="h-3.5 w-3.5" /> 警告</div>
          <div className="text-2xl font-semibold mt-2">{stats.warning}</div>
        </div>
        <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-4 bg-white dark:bg-gray-950">
          <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2"><Clock3 className="h-3.5 w-3.5" /> 失败</div>
          <div className="text-2xl font-semibold mt-2">{stats.failed}</div>
        </div>
      </section>

      <section className="grid grid-cols-[360px_1fr] gap-4 min-h-[560px]">
        <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-gray-950 flex flex-col min-h-0">
          <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-medium">最近分析 run</div>
              <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">选中某次运行后，可查看其详细事件流。</div>
            </div>
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin text-slate-400" /> : null}
          </div>
          <div className="flex-1 overflow-auto p-3 space-y-2">
            {runs.length === 0 ? (
              <div className="text-xs text-slate-500 dark:text-slate-400 leading-6">暂无分析历史。启用后，从下一次分析开始会持续记录每一步。</div>
            ) : (
              runs.map((run) => {
                const active = selectedRun?.run_id === run.run_id;
                const dbSources = run.request_summary?.active_database_sources || [];
                return (
                  <button
                    key={run.run_id}
                    type="button"
                    onClick={() => onSelectRun(run.run_id)}
                    className={`w-full text-left rounded-lg border p-3 transition-colors ${active ? "border-cyan-400 bg-cyan-50 dark:bg-cyan-950/20 dark:border-cyan-800" : "border-slate-200 dark:border-slate-800 hover:border-cyan-300 dark:hover:border-cyan-900"}`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-xs font-medium text-slate-900 dark:text-slate-100 truncate">{run.run_id}</div>
                      <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] ${statusTone[run.status] || statusTone.info}`}>{run.status}</span>
                    </div>
                    <div className="mt-2 text-[11px] text-slate-500 dark:text-slate-400 space-y-1">
                      <div>Session: {run.session_id}</div>
                      <div>开始: {formatDateTime(run.started_at)}</div>
                      <div>耗时: {formatDuration(run.duration_ms)} | 事件: {run.event_count || 0}</div>
                      <div>模式: {run.request_summary?.analysis_mode || "-"} | 策略: {run.request_summary?.strategy || "-"}</div>
                      <div>模型: {run.request_summary?.model_provider?.model || run.request_summary?.model_provider?.label || "-"}</div>
                      <div>数据源: {dbSources.length > 0 ? dbSources.map((item) => item.label || item.db_type).join(" / ") : "无数据库"}</div>
                    </div>
                    {run.last_message ? <div className="mt-2 text-[11px] text-slate-700 dark:text-slate-300 line-clamp-2">{run.last_message}</div> : null}
                  </button>
                );
              })
            )}
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-gray-950 flex flex-col min-h-0 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800">
            <div className="text-sm font-medium flex items-center gap-2">
              <Workflow className="h-4 w-4 text-cyan-600" />
              {selectedRun ? "运行明细" : "选择左侧 run 查看明细"}
            </div>
            {selectedRun ? (
              <div className="mt-2 grid grid-cols-2 gap-3 text-[11px] text-slate-500 dark:text-slate-400">
                <div>运行状态: <span className="text-slate-800 dark:text-slate-200">{selectedRun.status}</span></div>
                <div>耗时: <span className="text-slate-800 dark:text-slate-200">{formatDuration(selectedRun.duration_ms)}</span></div>
                <div>最近事件: <span className="text-slate-800 dark:text-slate-200">{selectedRun.last_stage || "-"} / {selectedRun.last_event || "-"}</span></div>
                <div>报告类型: <span className="text-slate-800 dark:text-slate-200">{(selectedRequestSummary?.report_types || []).join(", ") || "-"}</span></div>
                <div>语言: <span className="text-slate-800 dark:text-slate-200">{selectedRequestSummary?.analysis_language || "-"}</span></div>
                <div>模型 Provider: <span className="text-slate-800 dark:text-slate-200">{selectedRequestSummary?.model_provider?.providerType || "-"}</span></div>
                <div className="col-span-2">问题提示: <span className="text-slate-800 dark:text-slate-200">{selectedRun.last_problem || selectedRun.last_message || "-"}</span></div>
              </div>
            ) : (
              <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">这里会展示单次分析 run 的完整阶段事件，包括提示词装配、LLM 进度、代码执行结果和报告兜底信息。</div>
            )}
          </div>

          <div className="flex-1 overflow-auto p-4 space-y-3 bg-slate-50/80 dark:bg-slate-950/70">
            {isLoadingDetail ? (
              <div className="h-full flex items-center justify-center text-sm text-slate-500"><Loader2 className="mr-2 h-4 w-4 animate-spin" />正在加载运行明细...</div>
            ) : !selectedRun ? (
              <div className="h-full flex items-center justify-center text-sm text-slate-500">请先选择左侧的一次分析运行。</div>
            ) : events.length === 0 ? (
              <div className="h-full flex items-center justify-center text-sm text-slate-500">当前 run 暂无事件明细。</div>
            ) : (
              events.map((event) => {
                const detailJson = formatDetailJson(event.details as Record<string, unknown> | undefined);
                return (
                  <div key={`${event.run_id}-${event.sequence}`} className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-gray-950 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-slate-900 text-white text-[10px] px-2">{event.sequence}</span>
                        <span className="text-xs font-medium text-slate-900 dark:text-slate-100 truncate">{event.stage} / {event.event}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className={`rounded-full border px-2 py-0.5 text-[10px] ${statusTone[event.status] || statusTone.info}`}>{event.status}</span>
                        <span className="text-[10px] text-slate-500 dark:text-slate-400">{formatDuration(event.elapsed_ms)}</span>
                      </div>
                    </div>
                    <div className="mt-2 text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-4 flex-wrap">
                      <span>{formatDateTime(event.timestamp)}</span>
                      {event.details && "round" in event.details ? <span>round: {String(event.details.round)}</span> : null}
                    </div>
                    {event.message ? <div className="mt-2 text-sm text-slate-800 dark:text-slate-200 whitespace-pre-wrap">{event.message}</div> : null}
                    {detailJson ? (
                      <pre className="mt-3 rounded-md bg-slate-950 text-cyan-100 p-3 overflow-auto text-[11px] leading-5">{detailJson}</pre>
                    ) : null}
                  </div>
                );
              })
            )}
          </div>

          <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-2">
            <Database className="h-3.5 w-3.5" />
            该历史记录重点服务于稳健性排障、性能优化、提示词治理、思考方式回放和分析质量复盘。
          </div>
        </div>
      </section>
    </div>
  );
}