"use client";

import { useEffect, useMemo, useState } from "react";
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
  stale_idle_ms?: number;
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

interface AnalysisEventGroup {
  id: string;
  stage: string;
  stageLabel: string;
  roundLabel: string;
  count: number;
  status: string;
  events: AnalysisHistoryEvent[];
  firstEvent: AnalysisHistoryEvent;
  lastEvent: AnalysisHistoryEvent;
  summary: string;
  eventLabels: string[];
}

const statusTone: Record<string, string> = {
  completed: "text-emerald-700 bg-emerald-50 border-emerald-200 dark:text-emerald-300 dark:bg-emerald-950/40 dark:border-emerald-900",
  failed: "text-rose-700 bg-rose-50 border-rose-200 dark:text-rose-300 dark:bg-rose-950/40 dark:border-rose-900",
  warning: "text-amber-700 bg-amber-50 border-amber-200 dark:text-amber-300 dark:bg-amber-950/40 dark:border-amber-900",
  running: "text-cyan-700 bg-cyan-50 border-cyan-200 dark:text-cyan-300 dark:bg-cyan-950/40 dark:border-cyan-900",
  info: "text-slate-700 bg-slate-50 border-slate-200 dark:text-slate-300 dark:bg-slate-900 dark:border-slate-800",
};

const stageLabelMap: Record<string, string> = {
  session: "会话流程",
  round: "执行轮次",
  prompt: "提示词装配",
  planner: "任务规划",
  llm: "模型推理",
  code: "代码执行",
  sql: "SQL取数",
  r: "R分析",
  report: "报告整理",
  database: "数据库处理",
  guidance: "过程指导",
  knowledge: "知识注入",
  artifact: "产物整理",
  recovery: "兜底恢复",
  export: "结果导出",
  answer: "结论输出",
};

function getStageLabel(stage?: string) {
  if (!stage) return "未知阶段";
  return stageLabelMap[stage] || stage;
}

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

function truncateText(value: string | undefined, maxLength: number) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}...`;
}

function getRoundLabel(event: AnalysisHistoryEvent) {
  const round = event.details?.round;
  if (typeof round === "number" || typeof round === "string") {
    return `round ${String(round)}`;
  }
  return "系统事件";
}

function mergeStatus(current: string, next: string) {
  const priority: Record<string, number> = {
    failed: 5,
    warning: 4,
    running: 3,
    completed: 2,
    info: 1,
  };
  return (priority[next] || 0) >= (priority[current] || 0) ? next : current;
}

function buildEventGroups(events: AnalysisHistoryEvent[]): AnalysisEventGroup[] {
  if (events.length === 0) return [];

  const ordered = [...events].sort((left, right) => left.sequence - right.sequence);
  const groups: AnalysisEventGroup[] = [];

  ordered.forEach((event) => {
    const stage = event.stage || "unknown";
    const roundLabel = getRoundLabel(event);
    const groupKey = `${stage}::${roundLabel}`;
    const previous = groups[groups.length - 1];

    if (previous && previous.id === groupKey) {
      previous.events.push(event);
      previous.count += 1;
      previous.status = mergeStatus(previous.status, event.status || "info");
      previous.eventLabels = Array.from(new Set([...previous.eventLabels, event.event].filter(Boolean)));
      previous.summary = truncateText(event.message || previous.summary, 120) || previous.summary;
      previous.lastEvent = event;
      return;
    }

    groups.push({
      id: groupKey,
      stage,
      stageLabel: getStageLabel(stage),
      roundLabel,
      count: 1,
      status: event.status || "info",
      events: [event],
      firstEvent: event,
      lastEvent: event,
      summary: truncateText(event.message, 120) || `${getStageLabel(stage)}事件组`,
      eventLabels: event.event ? [event.event] : [],
    });
  });

  return groups;
}

function buildRunMeta(run: AnalysisHistoryRunSummary) {
  const dbSources = run.request_summary?.active_database_sources || [];
  return [
    `模式 ${run.request_summary?.analysis_mode || "-"}`,
    `策略 ${run.request_summary?.strategy || "-"}`,
    `模型 ${run.request_summary?.model_provider?.model || run.request_summary?.model_provider?.label || "-"}`,
    `数据源 ${dbSources.length > 0 ? dbSources.map((item) => item.label || item.db_type).filter(Boolean).join(" / ") : "无数据库"}`,
  ];
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
  const [selectedGroup, setSelectedGroup] = useState<AnalysisEventGroup | null>(null);
  const [detailKeyword, setDetailKeyword] = useState("");
  const selectedRequestSummary = selectedRun?.request_summary;
  const groupedEvents = useMemo(() => buildEventGroups(events), [events]);

  useEffect(() => {
    if (!selectedRun || groupedEvents.length === 0) {
      setSelectedGroup(null);
      return;
    }

    setSelectedGroup((previous) => {
      if (!previous) {
        return groupedEvents[0];
      }
      const next = groupedEvents.find(
        (group) => group.id === previous.id && group.firstEvent.sequence === previous.firstEvent.sequence
      );
      return next || groupedEvents[0];
    });
  }, [groupedEvents, selectedRun]);

  const currentGroup = selectedGroup || groupedEvents[0] || null;

  const selectedGroupEvents = useMemo(() => {
    if (!currentGroup) return [];
    const keyword = detailKeyword.trim().toLowerCase();
    if (!keyword) return currentGroup.events;

    return currentGroup.events.filter((event) => {
      const detailJson = formatDetailJson(event.details as Record<string, unknown> | undefined);
      const haystack = [
        event.event,
        event.stage,
        event.status,
        event.message,
        detailJson,
      ]
        .map((item) => String(item || "").toLowerCase())
        .join("\n");
      return haystack.includes(keyword);
    });
  }, [currentGroup, detailKeyword]);

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-hidden">
      <section className="grid shrink-0 gap-4 xl:grid-cols-[1.35fr_1fr]">
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-gray-950">
          <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-[linear-gradient(120deg,rgba(15,23,42,1),rgba(8,47,73,0.96))] px-4 py-3 text-white dark:border-slate-800">
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold">
                <History className="h-4 w-4" />
                分析历史与过程追踪
              </div>
              <div className="mt-1 text-xs leading-5 text-cyan-100/90">
                主视图只显示可滚动的分层过程。点击阶段分组，例如“SQL取数 2 个事件”，再展开原始事件和 details。
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="secondary" size="sm" onClick={onRefresh} disabled={isLoading}>
                {isLoading ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-2 h-3.5 w-3.5" />}
                刷新记录
              </Button>
              <Button size="sm" onClick={onSave} disabled={isSaving}>
                {isSaving ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : null}
                保存设置
              </Button>
            </div>
          </div>

          <div className="px-4 py-4">
            <div className="rounded-lg border border-slate-200 bg-white p-3 text-[11px] text-slate-500 dark:border-slate-800 dark:bg-gray-950 dark:text-slate-400">
              <div className="flex items-center gap-2 text-sm font-medium text-slate-900 dark:text-slate-100">
                <Workflow className="h-4 w-4 text-cyan-600" />
                {selectedRun ? "当前选中 run" : "选中 run 后显示摘要"}
              </div>
              {selectedRun ? (
                <div className="mt-3 space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 truncate text-[12px] font-medium text-slate-800 dark:text-slate-200">{selectedRun.run_id}</div>
                    <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] ${statusTone[selectedRun.status] || statusTone.info}`}>{selectedRun.status}</span>
                  </div>
                  <div>开始: <span className="text-slate-700 dark:text-slate-300">{formatDateTime(selectedRun.started_at)}</span></div>
                  <div>耗时: <span className="text-slate-700 dark:text-slate-300">{formatDuration(selectedRun.duration_ms)}</span> · 事件: <span className="text-slate-700 dark:text-slate-300">{selectedRun.event_count || 0}</span></div>
                  <div>最近阶段: <span className="text-slate-700 dark:text-slate-300">{getStageLabel(selectedRun.last_stage)} / {selectedRun.last_event || "-"}</span></div>
                  <div>最近提示: <span className="text-slate-700 dark:text-slate-300">{selectedRun.last_problem || selectedRun.last_message || "-"}</span></div>
                </div>
              ) : (
                <div className="mt-2 leading-5">选择左侧某次运行后，这里会显示它的摘要，主滚动区则展示它的分层过程。</div>
              )}
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-gray-950">
          <div className="space-y-4 px-4 py-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium">启用详细记录</div>
                    <div className="mt-1 text-[11px] leading-5 text-slate-500 dark:text-slate-400">每次分析写入独立 run 和事件流。</div>
                  </div>
                  <Switch checked={settings.enabled} onCheckedChange={(checked) => setSettings((prev) => ({ ...prev, enabled: Boolean(checked) }))} />
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium">记录流式进度</div>
                    <div className="mt-1 text-[11px] leading-5 text-slate-500 dark:text-slate-400">帮助定位卡在哪一轮 token 推进。</div>
                  </div>
                  <Switch checked={settings.capture_stream_progress} onCheckedChange={(checked) => setSettings((prev) => ({ ...prev, capture_stream_progress: Boolean(checked) }))} />
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800 sm:col-span-2">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium">记录提示词预览</div>
                    <div className="mt-1 text-[11px] leading-5 text-slate-500 dark:text-slate-400">用于排查提示词膨胀、上下文注入和策略变化。</div>
                  </div>
                  <Switch checked={settings.capture_prompt_preview} onCheckedChange={(checked) => setSettings((prev) => ({ ...prev, capture_prompt_preview: Boolean(checked) }))} />
                </div>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
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
              <div className="space-y-1.5">
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

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-3 dark:border-slate-800 dark:bg-slate-950/40">
                <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400"><Activity className="h-3.5 w-3.5" /> 总 run</div>
                <div className="mt-2 text-xl font-semibold text-slate-900 dark:text-slate-100">{stats.total}</div>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-3 dark:border-slate-800 dark:bg-slate-950/40">
                <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400"><ShieldCheck className="h-3.5 w-3.5" /> 完成</div>
                <div className="mt-2 text-xl font-semibold text-slate-900 dark:text-slate-100">{stats.completed}</div>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-3 dark:border-slate-800 dark:bg-slate-950/40">
                <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400"><AlertTriangle className="h-3.5 w-3.5" /> 警告</div>
                <div className="mt-2 text-xl font-semibold text-slate-900 dark:text-slate-100">{stats.warning}</div>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-3 dark:border-slate-800 dark:bg-slate-950/40">
                <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400"><Clock3 className="h-3.5 w-3.5" /> 失败</div>
                <div className="mt-2 text-xl font-semibold text-slate-900 dark:text-slate-100">{stats.failed}</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="grid min-h-0 flex-1 gap-4 xl:grid-cols-[minmax(300px,360px)_1fr]">
        <div className="flex min-h-0 flex-col rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-gray-950">
          <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
            <div>
              <div className="text-sm font-medium text-slate-900 dark:text-slate-100">最近分析 run</div>
              <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">选中某次运行后，右侧直接看分层过程。</div>
            </div>
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin text-slate-400" /> : null}
          </div>

          <div className="flex-1 min-h-0 space-y-2 overflow-y-auto p-3">
            {runs.length === 0 ? (
              <div className="text-xs leading-6 text-slate-500 dark:text-slate-400">暂无分析历史。启用后，从下一次分析开始会持续记录每一步。</div>
            ) : (
              runs.map((run) => {
                const active = selectedRun?.run_id === run.run_id;
                return (
                  <button
                    key={run.run_id}
                    type="button"
                    onClick={() => onSelectRun(run.run_id)}
                    className={`w-full rounded-lg border p-3 text-left transition-colors ${active ? "border-cyan-400 bg-cyan-50 dark:border-cyan-800 dark:bg-cyan-950/20" : "border-slate-200 hover:border-cyan-300 dark:border-slate-800 dark:hover:border-cyan-900"}`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0 truncate text-[12px] font-medium text-slate-900 dark:text-slate-100">{run.run_id}</div>
                      <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] ${statusTone[run.status] || statusTone.info}`}>{run.status}</span>
                    </div>
                    <div className="mt-2 space-y-1 text-[11px] text-slate-500 dark:text-slate-400">
                      <div className="break-all" title={run.session_id}>Session: {run.session_id}</div>
                      <div>开始: {formatDateTime(run.started_at)}</div>
                      <div>耗时: {formatDuration(run.duration_ms)} · 事件: {run.event_count || 0}</div>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] text-slate-500 dark:text-slate-400">
                      {buildRunMeta(run).map((item) => (
                        <span key={item} className="rounded-full border border-slate-200 px-2 py-0.5 dark:border-slate-700">{item}</span>
                      ))}
                    </div>
                    {run.last_message ? <div className="mt-2 text-[11px] leading-5 text-slate-700 dark:text-slate-300">{truncateText(run.last_message, 100)}</div> : null}
                    {run.last_problem ? <div className="mt-2 text-[11px] leading-5 text-amber-700 dark:text-amber-300">{truncateText(run.last_problem, 100)}</div> : null}
                  </button>
                );
              })
            )}
          </div>
        </div>

        <div className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-gray-950">
          <div className="shrink-0 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
            <div className="flex items-center gap-2 text-sm font-medium text-slate-900 dark:text-slate-100">
              <Workflow className="h-4 w-4 text-cyan-600" />
              {selectedRun ? "分层过程记录" : "选择左侧 run 查看分层过程"}
            </div>
            {selectedRun ? (
              <>
                <div className="mt-3 grid gap-2 text-[11px] text-slate-500 dark:text-slate-400 md:grid-cols-2 xl:grid-cols-3">
                  <div>运行状态: <span className="text-slate-800 dark:text-slate-200">{selectedRun.status}</span></div>
                  <div>耗时: <span className="text-slate-800 dark:text-slate-200">{formatDuration(selectedRun.duration_ms)}</span></div>
                  <div>最近事件: <span className="text-slate-800 dark:text-slate-200">{getStageLabel(selectedRun.last_stage)} / {selectedRun.last_event || "-"}</span></div>
                  <div>报告类型: <span className="text-slate-800 dark:text-slate-200">{(selectedRequestSummary?.report_types || []).join(", ") || "-"}</span></div>
                  <div>语言: <span className="text-slate-800 dark:text-slate-200">{selectedRequestSummary?.analysis_language || "-"}</span></div>
                  <div>Provider: <span className="text-slate-800 dark:text-slate-200">{selectedRequestSummary?.model_provider?.providerType || "-"}</span></div>
                  <div className="md:col-span-2 xl:col-span-3">问题提示: <span className="text-slate-800 dark:text-slate-200">{selectedRun.last_problem || selectedRun.last_message || "-"}</span></div>
                </div>
                <div className="mt-2 text-xs text-cyan-700 dark:text-cyan-300">左侧先选分组，右侧立即查看原始事件与 details，不再弹窗跳转。</div>
              </>
            ) : (
              <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">选中 run 后即可在同屏连续浏览分组与原始 details。</div>
            )}
          </div>

          <div className="flex min-h-0 flex-1 gap-3 overflow-hidden bg-slate-50/80 p-4 dark:bg-slate-950/70">
            {isLoadingDetail ? (
              <div className="flex h-full items-center justify-center text-sm text-slate-500"><Loader2 className="mr-2 h-4 w-4 animate-spin" />正在加载运行明细...</div>
            ) : !selectedRun ? (
              <div className="flex h-full items-center justify-center text-sm text-slate-500">请先选择左侧的一次分析运行。</div>
            ) : groupedEvents.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-slate-500">当前 run 暂无事件明细。</div>
            ) : (
              <>
                <div className="flex min-h-0 w-full flex-col overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-gray-950 xl:w-[360px]">
                  <div className="shrink-0 border-b border-slate-200 px-3 py-2 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
                    分组列表 · 共 {groupedEvents.length} 组
                  </div>
                  <div className="flex-1 space-y-2 overflow-auto p-2">
                    {groupedEvents.map((group) => {
                      const active = currentGroup && group.id === currentGroup.id && group.firstEvent.sequence === currentGroup.firstEvent.sequence;
                      return (
                        <button
                          key={`${group.id}-${group.firstEvent.sequence}`}
                          type="button"
                          onClick={() => setSelectedGroup(group)}
                          className={`w-full rounded-lg border p-3 text-left transition-colors ${active ? "border-cyan-400 bg-cyan-50 dark:border-cyan-800 dark:bg-cyan-950/20" : "border-slate-200 bg-white hover:border-cyan-300 dark:border-slate-800 dark:bg-gray-950 dark:hover:border-cyan-900"}`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="text-xs font-medium text-slate-900 dark:text-slate-100">
                                {group.count > 1 ? `${group.stageLabel} ${group.count} 个事件` : `${group.stageLabel} / ${group.firstEvent.event}`}
                              </div>
                              <div className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">{group.roundLabel} · 序号 {group.firstEvent.sequence}-{group.lastEvent.sequence}</div>
                              <div className="mt-1 text-[11px] leading-5 text-slate-700 dark:text-slate-300">{group.summary || "查看详情"}</div>
                            </div>
                            <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] ${statusTone[group.status] || statusTone.info}`}>{group.status}</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-gray-950">
                  <div className="shrink-0 border-b border-slate-200 px-3 py-3 dark:border-slate-800">
                    {currentGroup ? (
                      <>
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
                            {currentGroup.count > 1 ? `${currentGroup.stageLabel} ${currentGroup.count} 个事件` : `${currentGroup.stageLabel} / ${currentGroup.firstEvent.event}`}
                          </div>
                          <span className={`rounded-full border px-2 py-0.5 text-[10px] ${statusTone[currentGroup.status] || statusTone.info}`}>{currentGroup.status}</span>
                        </div>
                        <div className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">
                          {currentGroup.roundLabel} · {formatDateTime(currentGroup.firstEvent.timestamp)} 至 {formatDateTime(currentGroup.lastEvent.timestamp)}
                        </div>
                      </>
                    ) : (
                      <div className="text-sm text-slate-500">请选择一个分组</div>
                    )}
                    <div className="mt-3">
                      <Input
                        value={detailKeyword}
                        onChange={(event) => setDetailKeyword(event.target.value)}
                        placeholder="按事件名、消息、details 关键词过滤"
                        className="h-8"
                      />
                    </div>
                    <div className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">
                      当前显示 {selectedGroupEvents.length} / {currentGroup?.events.length || 0} 条原始事件
                    </div>
                  </div>

                  <div className="flex-1 space-y-3 overflow-auto p-3">
                    {selectedGroupEvents.length === 0 ? (
                      <div className="rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
                        没有匹配到事件，请调整关键词。
                      </div>
                    ) : (
                      selectedGroupEvents.map((event) => {
                        const detailJson = formatDetailJson(event.details as Record<string, unknown> | undefined);
                        return (
                          <div key={`${event.run_id}-${event.sequence}`} className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-gray-950">
                            <div className="flex items-center justify-between gap-3">
                              <div className="flex min-w-0 items-center gap-2">
                                <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-slate-900 px-2 text-[10px] text-white">{event.sequence}</span>
                                <span className="truncate text-xs font-medium text-slate-900 dark:text-slate-100">{getStageLabel(event.stage)} / {event.event}</span>
                              </div>
                              <div className="flex shrink-0 items-center gap-2">
                                <span className={`rounded-full border px-2 py-0.5 text-[10px] ${statusTone[event.status] || statusTone.info}`}>{event.status}</span>
                                <span className="text-[10px] text-slate-500 dark:text-slate-400">{formatDuration(event.elapsed_ms)}</span>
                              </div>
                            </div>
                            <div className="mt-2 flex flex-wrap gap-3 text-[10px] text-slate-500 dark:text-slate-400">
                              <span>{formatDateTime(event.timestamp)}</span>
                              <span>{getRoundLabel(event)}</span>
                            </div>
                            {event.message ? <div className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-800 dark:text-slate-200">{event.message}</div> : null}
                            {detailJson ? (
                              <details className="mt-3 rounded-md border border-slate-200 bg-slate-50/80 p-2 text-[11px] dark:border-slate-700 dark:bg-slate-900/40">
                                <summary className="cursor-pointer select-none text-[11px] text-slate-600 dark:text-slate-300">查看 details JSON</summary>
                                <pre className="mt-2 overflow-auto rounded-md bg-slate-950 p-3 text-[11px] leading-5 text-cyan-100">{detailJson}</pre>
                              </details>
                            ) : null}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </>
            )}
          </div>

          <div className="shrink-0 border-t border-slate-200 px-4 py-3 text-[11px] text-slate-500 dark:border-slate-800 dark:text-slate-400">
            <div className="flex items-center gap-2">
              <Database className="h-3.5 w-3.5" />
              历史明细已改为“同屏浏览”：左侧分组，右侧连续查看事件与 details，便于逐条复盘。
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}