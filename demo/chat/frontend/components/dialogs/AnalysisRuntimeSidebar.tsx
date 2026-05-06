"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Activity, AlertTriangle, Clock3, History, Loader2, ShieldCheck, Workflow } from "lucide-react";
import type { AnalysisHistoryEvent, AnalysisHistoryRunSummary } from "./AnalysisHistorySettingsPanel";

interface AnalysisRuntimeSidebarProps {
  run: AnalysisHistoryRunSummary | null;
  events: AnalysisHistoryEvent[];
  loading: boolean;
  isAnalyzing: boolean;
  onOpenFullHistory: () => void;
}

interface StageStallRule {
  label: string;
  warningMs: number;
  criticalMs: number;
  warningTitle: string;
  criticalTitle: string;
}

interface StallSignal {
  level: "healthy" | "watch" | "warning" | "critical";
  idleMs: number;
  label: string;
  message: string;
  latestEvent: AnalysisHistoryEvent | null;
  stage: string;
  stageLabel: string;
  rule: StageStallRule;
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

const statusClassMap: Record<string, string> = {
  completed: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300",
  failed: "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300",
  warning: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300",
  running: "border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-900 dark:bg-cyan-950/30 dark:text-cyan-300",
  info: "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300",
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

const stallToneMap: Record<string, string> = {
  healthy: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300",
  watch: "border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-900 dark:bg-cyan-950/30 dark:text-cyan-300",
  warning: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300",
  critical: "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300",
};

const DEFAULT_STALL_RULE: StageStallRule = {
  label: "通用流程",
  warningMs: 20000,
  criticalMs: 45000,
  warningTitle: "流程需要关注",
  criticalTitle: "流程疑似卡顿",
};

const stageStallRuleMap: Record<string, StageStallRule> = {
  session: { label: "会话流程", warningMs: 15000, criticalMs: 35000, warningTitle: "会话推进变慢", criticalTitle: "会话推进疑似卡顿" },
  round: { label: "执行轮次", warningMs: 12000, criticalMs: 28000, warningTitle: "轮次切换变慢", criticalTitle: "轮次切换疑似卡顿" },
  prompt: { label: "提示词装配", warningMs: 8000, criticalMs: 18000, warningTitle: "提示词装配变慢", criticalTitle: "提示词装配疑似卡顿" },
  planner: { label: "任务规划", warningMs: 12000, criticalMs: 28000, warningTitle: "任务规划变慢", criticalTitle: "任务规划疑似卡顿" },
  llm: { label: "模型推理", warningMs: 18000, criticalMs: 45000, warningTitle: "模型推理变慢", criticalTitle: "模型推理疑似超时" },
  code: { label: "代码执行", warningMs: 30000, criticalMs: 90000, warningTitle: "代码执行变慢", criticalTitle: "代码执行疑似超时" },
  sql: { label: "SQL取数", warningMs: 15000, criticalMs: 60000, warningTitle: "SQL取数变慢", criticalTitle: "SQL取数疑似超时" },
  r: { label: "R分析", warningMs: 30000, criticalMs: 90000, warningTitle: "R分析变慢", criticalTitle: "R分析疑似超时" },
  database: { label: "数据库读取", warningMs: 10000, criticalMs: 30000, warningTitle: "数据库读取变慢", criticalTitle: "数据库读取疑似超时" },
  report: { label: "报告整理", warningMs: 15000, criticalMs: 40000, warningTitle: "报告整理变慢", criticalTitle: "报告整理疑似卡顿" },
  artifact: { label: "产物整理", warningMs: 12000, criticalMs: 30000, warningTitle: "产物整理变慢", criticalTitle: "产物整理疑似卡顿" },
  recovery: { label: "兜底恢复", warningMs: 12000, criticalMs: 30000, warningTitle: "兜底恢复变慢", criticalTitle: "兜底恢复疑似卡顿" },
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
  return parsed.toLocaleTimeString("zh-CN", { hour12: false });
}

function formatLag(durationMs?: number) {
  const value = Number(durationMs);
  if (!Number.isFinite(value) || value < 0) return "-";
  if (value < 1000) return `${Math.round(value)} ms`;
  const seconds = value / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)} s`;
  return `${(seconds / 60).toFixed(1)} min`;
}

function parseTimestamp(value?: string) {
  if (!value) return null;
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? null : parsed;
}

function getStageLabel(stage?: string) {
  if (!stage) return "未知阶段";
  return stageLabelMap[stage] || stage;
}

function getStageStallRule(stage?: string): StageStallRule {
  if (!stage) return DEFAULT_STALL_RULE;
  return stageStallRuleMap[stage] || DEFAULT_STALL_RULE;
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

function formatDetailJson(details?: Record<string, unknown>) {
  if (!details || Object.keys(details).length === 0) return "";
  try {
    return JSON.stringify(details, null, 2);
  } catch {
    return "";
  }
}

function buildStageAdvice(stage: string, level: "healthy" | "warning" | "critical", run: AnalysisHistoryRunSummary | null): string {
  const hasDatabaseSources = (run?.request_summary?.active_database_sources?.length || 0) > 0;

  switch (stage) {
    case "llm":
      if (level === "healthy") return "模型仍在返回新 token 或推进本轮生成。";
      if (level === "warning") return "优先检查 provider 负载、上下文长度和流式连接稳定性。";
      return "长时间没有新 token，建议检查上游模型服务、限流或直接切换 provider。";
    case "code":
      if (level === "healthy") return hasDatabaseSources ? "代码执行仍在推进，同时可以关注 SQL 返回速度。" : "代码执行仍在推进，通常处于 Python 子进程或文件 IO 阶段。";
      if (level === "warning") return hasDatabaseSources ? "优先检查 SQL 查询、网络、权限与 Python 子进程输出。" : "优先检查 Python 子进程、第三方库调用和文件 IO。";
      return hasDatabaseSources ? "代码执行可能卡在数据库查询或外部依赖。" : "代码执行可能卡在死循环、阻塞 IO 或子进程挂起。";
    case "sql":
      if (level === "healthy") return "SQL 取数仍在推进，结果会物化到 workspace/generated。";
      if (level === "warning") return "优先检查过滤条件、Join 路径、索引命中和返回行数。";
      return "SQL 长时间未返回，建议先改为更小粒度的聚合、采样或加过滤。";
    default:
      if (level === "healthy") return "当前阶段仍有新事件写入。";
      if (level === "warning") return "当前阶段推进速度低于预期，建议结合分层事件继续定位。";
      return "当前阶段长时间未推进，建议打开全量历史检查最近一次成功事件。";
  }
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
      previous.summary = truncateText(event.message || previous.summary, 110) || previous.summary;
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
      summary: truncateText(event.message, 110) || `${getStageLabel(stage)}事件组`,
      eventLabels: event.event ? [event.event] : [],
    });
  });

  return groups;
}

function buildStallSignal(run: AnalysisHistoryRunSummary | null, events: AnalysisHistoryEvent[], isAnalyzing: boolean, nowMs: number): StallSignal | null {
  const active = Boolean(isAnalyzing || run?.status === "running");
  if (!run && !active) return null;

  const latestEvent = events.length > 0 ? events[events.length - 1] : null;
  const activeStage = latestEvent?.stage || run?.last_stage || "session";
  const stageLabel = getStageLabel(activeStage);
  const rule = getStageStallRule(activeStage);
  const latestTimestampMs = parseTimestamp(latestEvent?.timestamp) ?? parseTimestamp(run?.updated_at) ?? parseTimestamp(run?.started_at);

  if (active && latestTimestampMs === null) {
    return {
      level: "watch",
      idleMs: 0,
      label: "等待首条事件",
      message: `分析已经启动，正在等待${stageLabel}的第一条运行事件落盘。`,
      latestEvent: null,
      stage: activeStage,
      stageLabel,
      rule,
    };
  }

  if (!active) {
    if (run?.status === "failed" || run?.status === "warning") {
      return {
        level: "warning",
        idleMs: 0,
        label: "本轮已结束",
        message: run.last_problem || "当前 run 已停止，可打开全量历史查看详细问题上下文。",
        latestEvent,
        stage: activeStage,
        stageLabel,
        rule,
      };
    }
    return {
      level: "healthy",
      idleMs: 0,
      label: "本轮已完成",
      message: "当前 run 已停止，侧栏保留最后一批事件供快速回看。",
      latestEvent,
      stage: activeStage,
      stageLabel,
      rule,
    };
  }

  const idleMs = Math.max(0, nowMs - (latestTimestampMs || nowMs));
  if (idleMs >= rule.criticalMs) {
    return {
      level: "critical",
      idleMs,
      label: rule.criticalTitle,
      message: `${formatLag(idleMs)} 未写入新事件，当前停留在${stageLabel}。${buildStageAdvice(activeStage, "critical", run)}`,
      latestEvent,
      stage: activeStage,
      stageLabel,
      rule,
    };
  }
  if (idleMs >= rule.warningMs) {
    return {
      level: "warning",
      idleMs,
      label: rule.warningTitle,
      message: `${formatLag(idleMs)} 未写入新事件，当前停留在${stageLabel}。${buildStageAdvice(activeStage, "warning", run)}`,
      latestEvent,
      stage: activeStage,
      stageLabel,
      rule,
    };
  }
  return {
    level: "healthy",
    idleMs,
    label: `${rule.label}正常`,
    message: `最近 ${formatLag(idleMs)} 内仍有新事件，当前阶段为${stageLabel}。${buildStageAdvice(activeStage, "healthy", run)}`,
    latestEvent,
    stage: activeStage,
    stageLabel,
    rule,
  };
}

export function AnalysisRuntimeSidebar({ run, events, loading, isAnalyzing, onOpenFullHistory }: AnalysisRuntimeSidebarProps) {
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [selectedGroup, setSelectedGroup] = useState<AnalysisEventGroup | null>(null);

  useEffect(() => {
    setNowMs(Date.now());
    const active = Boolean(isAnalyzing || run?.status === "running");
    if (!active) return;
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [isAnalyzing, run?.status, run?.updated_at, events.length]);

  const orderedEvents = useMemo(() => [...events].sort((left, right) => left.sequence - right.sequence), [events]);
  const groupedEvents = useMemo(() => buildEventGroups(orderedEvents).slice(-18).reverse(), [orderedEvents]);
  const stallSignal = useMemo(() => buildStallSignal(run, orderedEvents, isAnalyzing, nowMs), [run, orderedEvents, isAnalyzing, nowMs]);
  const syncing = Boolean(isAnalyzing || (run?.status === "running" && stallSignal?.level !== "critical"));
  const needsAttention = Boolean(!isAnalyzing && run?.status === "running" && stallSignal?.level === "critical");

  return (
    <div className="flex h-full min-h-0 flex-col bg-gray-50 dark:bg-gray-900">
      <div className="flex shrink-0 items-center justify-between border-b border-gray-200 px-4 py-2 dark:border-gray-800">
        <div className="flex items-center gap-3">
          <h2 className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
            <Workflow className="h-4 w-4 text-cyan-600" />
            分析过程
          </h2>
          {syncing ? (
            <div className="flex items-center gap-1 text-[11px] text-cyan-600 dark:text-cyan-400">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              <span>同步中</span>
            </div>
          ) : null}
          {needsAttention ? <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">待核查</span> : null}
        </div>
        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200" onClick={onOpenFullHistory}>
          <History className="mr-1 h-3.5 w-3.5" />
          全量历史
        </Button>
      </div>

      {!run ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center text-gray-400 dark:text-gray-500">
          {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Activity className="h-8 w-8 text-cyan-500/70" />}
          <div className="space-y-1">
            <div className="text-sm text-gray-500 dark:text-gray-400">分析过程侧栏已就绪</div>
            <div className="max-w-[260px] text-xs leading-5">发起新一轮分析后，这里会同步显示 run 的分层过程，包括提示词装配、模型推理、SQL/代码执行与异常位置。</div>
          </div>
        </div>
      ) : (
        <>
          <div className="shrink-0 space-y-3 border-b border-gray-200 bg-white px-4 py-3 dark:border-gray-800 dark:bg-gray-950">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-xs font-medium text-gray-800 dark:text-gray-100">{run.run_id}</div>
                <div className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">session: {run.session_id}</div>
              </div>
              <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] ${statusClassMap[run.status] || statusClassMap.info}`}>{run.status}</span>
            </div>

            <div className="flex flex-wrap gap-2 text-[10px] text-gray-500 dark:text-gray-400">
              <span className="rounded-full border border-gray-200 px-2 py-1 dark:border-gray-800">开始 {formatDateTime(run.started_at)}</span>
              <span className="rounded-full border border-gray-200 px-2 py-1 dark:border-gray-800">耗时 {formatDuration(run.duration_ms)}</span>
              <span className="rounded-full border border-gray-200 px-2 py-1 dark:border-gray-800">事件 {run.event_count || 0}</span>
              <span className="rounded-full border border-gray-200 px-2 py-1 dark:border-gray-800">阶段 {getStageLabel(run.last_stage)} / {run.last_event || "-"}</span>
              <span className="rounded-full border border-gray-200 px-2 py-1 dark:border-gray-800">模式 {run.request_summary?.analysis_mode || "-"}</span>
              <span className="rounded-full border border-gray-200 px-2 py-1 dark:border-gray-800">策略 {run.request_summary?.strategy || "-"}</span>
            </div>

            {run.last_problem ? (
              <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{run.last_problem}</span>
              </div>
            ) : run.last_message ? (
              <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-[11px] leading-5 text-gray-600 dark:border-gray-800 dark:bg-gray-900/40 dark:text-gray-300">{run.last_message}</div>
            ) : null}

            {stallSignal ? (
              <div className={`rounded-lg border px-3 py-3 ${stallToneMap[stallSignal.level]}`}>
                <div className="flex items-start gap-2">
                  {stallSignal.level === "healthy" ? <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />}
                  <div className="min-w-0">
                    <div className="text-[11px] font-medium">{stallSignal.label}</div>
                    <div className="mt-1 text-[11px] leading-5">{stallSignal.message}</div>
                    {stallSignal.latestEvent ? <div className="mt-2 text-[10px] opacity-80">最近事件: {stallSignal.stageLabel} / {stallSignal.latestEvent.event} · {formatDateTime(stallSignal.latestEvent.timestamp)}</div> : null}
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          <div className="min-h-0 flex-1 overflow-auto px-3 py-3">
            <div className="mb-2 flex items-center justify-between gap-3 px-1">
              <div className="text-[11px] font-medium text-gray-600 dark:text-gray-300">分层事件流</div>
              <div className="text-[10px] text-gray-400 dark:text-gray-500">点击分组展开原始事件</div>
            </div>

            {groupedEvents.length === 0 ? (
              <div className="text-xs leading-6 text-gray-500 dark:text-gray-400">当前 run 尚未写入事件。若正在执行，几秒后会自动刷新。</div>
            ) : (
              <div className="space-y-2">
                {groupedEvents.map((group) => (
                  <button
                    key={`${group.id}-${group.firstEvent.sequence}`}
                    type="button"
                    onClick={() => setSelectedGroup(group)}
                    className="w-full rounded-lg border border-gray-200 bg-white px-3 py-3 text-left transition-colors hover:border-cyan-300 dark:border-gray-800 dark:bg-gray-950 dark:hover:border-cyan-900"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[12px] font-medium text-gray-800 dark:text-gray-100">{group.count > 1 ? `${group.stageLabel} ${group.count} 个事件` : `${group.stageLabel} / ${group.firstEvent.event}`}</span>
                          <span className="rounded-full border border-gray-200 px-2 py-0.5 text-[10px] text-gray-500 dark:border-gray-700 dark:text-gray-400">{group.roundLabel}</span>
                        </div>
                        <div className="mt-2 text-[11px] leading-5 text-gray-700 dark:text-gray-300">{group.summary || "点击查看该分组的原始事件与 details"}</div>
                        <div className="mt-2 flex flex-wrap gap-2 text-[10px] text-gray-400 dark:text-gray-500">
                          <span>序号 {group.firstEvent.sequence} - {group.lastEvent.sequence}</span>
                          <span>{formatDateTime(group.firstEvent.timestamp)}</span>
                          <span>至</span>
                          <span>{formatDateTime(group.lastEvent.timestamp)}</span>
                        </div>
                        {group.eventLabels.length > 0 ? (
                          <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] text-gray-400 dark:text-gray-500">
                            {group.eventLabels.slice(0, 4).map((label) => (
                              <span key={label} className="rounded-full border border-gray-200 px-2 py-0.5 dark:border-gray-700">{label}</span>
                            ))}
                          </div>
                        ) : null}
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-2">
                        <span className={`rounded-full border px-2 py-0.5 text-[10px] ${statusClassMap[group.status] || statusClassMap.info}`}>{group.status}</span>
                        <span className="text-[10px] text-gray-400 dark:text-gray-500">展开</span>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="shrink-0 border-t border-gray-200 bg-white px-4 py-2 text-[10px] text-gray-500 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-400">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-3.5 w-3.5 text-cyan-600" />
              这里优先展示运行态分层记录；完整字段与原始 details 请在系统设置的分析历史中查看。
            </div>
          </div>
        </>
      )}

      <Dialog open={Boolean(selectedGroup)} onOpenChange={(open) => { if (!open) setSelectedGroup(null); }}>
        <DialogContent className="flex h-[80vh] max-w-4xl flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle>
              {selectedGroup ? (selectedGroup.count > 1 ? `${selectedGroup.stageLabel} ${selectedGroup.count} 个事件` : `${selectedGroup.stageLabel} / ${selectedGroup.firstEvent.event}`) : "事件详情"}
            </DialogTitle>
          </DialogHeader>

          {selectedGroup ? (
            <div className="flex-1 space-y-3 overflow-auto pr-1">
              {selectedGroup.events.map((event) => {
                const detailJson = formatDetailJson(event.details as Record<string, unknown> | undefined);
                return (
                  <div key={`${event.run_id}-${event.sequence}`} className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-950">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-slate-900 px-2 text-[10px] text-white">{event.sequence}</span>
                        <span className="truncate text-xs font-medium text-gray-800 dark:text-gray-100">{getStageLabel(event.stage)} / {event.event}</span>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className={`rounded-full border px-2 py-0.5 text-[10px] ${statusClassMap[event.status] || statusClassMap.info}`}>{event.status}</span>
                        <span className="text-[10px] text-gray-500 dark:text-gray-400">{formatDuration(event.elapsed_ms)}</span>
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-3 text-[10px] text-gray-500 dark:text-gray-400">
                      <span>{getRoundLabel(event)}</span>
                      <span>{formatDateTime(event.timestamp)}</span>
                    </div>
                    {event.message ? <div className="mt-3 whitespace-pre-wrap text-sm leading-6 text-gray-800 dark:text-gray-200">{event.message}</div> : null}
                    {detailJson ? <pre className="mt-3 overflow-auto rounded-md bg-slate-950 p-3 text-[11px] leading-5 text-cyan-100">{detailJson}</pre> : null}
                  </div>
                );
              })}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}