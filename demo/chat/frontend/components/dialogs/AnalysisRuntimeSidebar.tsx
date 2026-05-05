"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Activity, AlertTriangle, BarChart3, Clock3, History, Loader2, ShieldCheck, Workflow } from "lucide-react";
import type { AnalysisHistoryEvent, AnalysisHistoryRunSummary } from "./AnalysisHistorySettingsPanel";

interface AnalysisRuntimeSidebarProps {
  run: AnalysisHistoryRunSummary | null;
  events: AnalysisHistoryEvent[];
  loading: boolean;
  isAnalyzing: boolean;
  onOpenFullHistory: () => void;
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
  report: "报告整理",
  database: "数据库处理",
  guidance: "过程指导",
  knowledge: "知识注入",
  artifact: "产物整理",
  recovery: "兜底恢复",
  export: "结果导出",
};

const stallToneMap: Record<string, string> = {
  healthy: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300",
  watch: "border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-900 dark:bg-cyan-950/30 dark:text-cyan-300",
  warning: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300",
  critical: "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300",
};

interface StageStallRule {
  label: string;
  warningMs: number;
  criticalMs: number;
  warningTitle: string;
  criticalTitle: string;
}

const DEFAULT_STALL_RULE: StageStallRule = {
  label: "通用流程",
  warningMs: 20000,
  criticalMs: 45000,
  warningTitle: "流程需要关注",
  criticalTitle: "流程疑似卡顿",
};

const stageStallRuleMap: Record<string, StageStallRule> = {
  session: {
    label: "会话流程",
    warningMs: 15000,
    criticalMs: 35000,
    warningTitle: "会话推进变慢",
    criticalTitle: "会话推进疑似卡顿",
  },
  round: {
    label: "执行轮次",
    warningMs: 12000,
    criticalMs: 28000,
    warningTitle: "轮次切换变慢",
    criticalTitle: "轮次切换疑似卡顿",
  },
  prompt: {
    label: "提示词装配",
    warningMs: 8000,
    criticalMs: 18000,
    warningTitle: "提示词装配变慢",
    criticalTitle: "提示词装配疑似卡顿",
  },
  planner: {
    label: "任务规划",
    warningMs: 12000,
    criticalMs: 28000,
    warningTitle: "任务规划变慢",
    criticalTitle: "任务规划疑似卡顿",
  },
  llm: {
    label: "模型推理",
    warningMs: 18000,
    criticalMs: 45000,
    warningTitle: "模型推理变慢",
    criticalTitle: "模型推理疑似超时",
  },
  code: {
    label: "代码执行",
    warningMs: 30000,
    criticalMs: 90000,
    warningTitle: "代码执行变慢",
    criticalTitle: "代码执行疑似超时",
  },
  database: {
    label: "数据库读取",
    warningMs: 10000,
    criticalMs: 30000,
    warningTitle: "数据库读取变慢",
    criticalTitle: "数据库读取疑似超时",
  },
  report: {
    label: "报告整理",
    warningMs: 15000,
    criticalMs: 40000,
    warningTitle: "报告整理变慢",
    criticalTitle: "报告整理疑似卡顿",
  },
  artifact: {
    label: "产物整理",
    warningMs: 12000,
    criticalMs: 30000,
    warningTitle: "产物整理变慢",
    criticalTitle: "产物整理疑似卡顿",
  },
  recovery: {
    label: "兜底恢复",
    warningMs: 12000,
    criticalMs: 30000,
    warningTitle: "兜底恢复变慢",
    criticalTitle: "兜底恢复疑似卡顿",
  },
};

interface StageTimingItem {
  stage: string;
  label: string;
  totalMs: number;
  eventCount: number;
  share: number;
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

function buildStageAdvice(
  stage: string,
  level: "healthy" | "warning" | "critical",
  run: AnalysisHistoryRunSummary | null,
): string {
  const hasDatabaseSources = (run?.request_summary?.active_database_sources?.length || 0) > 0;

  switch (stage) {
    case "llm":
      if (level === "healthy") return "正在等待模型返回新 token 或本轮生成结束。";
      if (level === "warning") return "优先检查模型网关负载、上下文长度、流式连接和 provider 速率限制。";
      return "长时间没有新 token，建议检查上游模型服务、限流、网关兼容性或直接切换 provider 重试。";
    case "code":
      if (level === "healthy") return hasDatabaseSources ? "代码执行仍在推进，若当前代码连库可同时关注 SQL 返回速度。" : "代码执行仍在推进，通常处于 Python 子进程、文件 IO 或图表渲染阶段。";
      if (level === "warning") return hasDatabaseSources ? "优先检查 SQL 查询、数据库网络、权限、文件 IO 和 Python 子进程输出。" : "优先检查 Python 子进程、第三方库调用、文件 IO 和图表导出。";
      return hasDatabaseSources ? "代码执行长时间未推进，可能卡在数据库查询、网络等待、权限校验或外部依赖。" : "代码执行长时间未推进，建议检查死循环、阻塞 IO、外部依赖或子进程挂起。";
    case "database":
      if (level === "healthy") return "数据库上下文仍在装配，正在整理已连接数据源与会话快照。";
      if (level === "warning") return "优先检查数据库连通性、Schema 快照、权限、知识库检索和数据源选择是否正确。";
      return "数据库上下文长时间未推进，建议检查连接配置、网络、权限、Schema 抓取或知识库查询延迟。";
    case "report":
      if (level === "healthy") return "报告整理仍在推进，通常处于文件写出、模板渲染或图表汇总阶段。";
      if (level === "warning") return "优先检查报告模板渲染、大图表导出和生成目录写入。";
      return "报告整理长时间未推进，建议检查导出文件尺寸、模板渲染和图表资源写出。";
    case "prompt":
      if (level === "healthy") return "提示词装配仍在推进，正在整理上下文、文件信息和数据库提示。";
      if (level === "warning") return "优先检查文件信息收集、数据库上下文拼接和提示词截断是否异常。";
      return "提示词装配长时间未推进，建议检查上下文注入、数据库提示组装或异常的超长输入。";
    default:
      if (level === "healthy") return "当前阶段仍有新事件写入。";
      if (level === "warning") return "当前阶段推进速度低于预期，建议结合最近事件和全量历史继续定位。";
      return "当前阶段长时间未推进，建议打开全量历史检查最近一次成功事件和上下文。";
  }
}

function getDetailNumber(details: Record<string, unknown> | undefined, key: string) {
  const value = details?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function buildStageTimingRank(events: AnalysisHistoryEvent[], runDurationMs?: number): StageTimingItem[] {
  if (events.length === 0) return [];

  const stageTotals = new Map<string, { totalMs: number; eventCount: number }>();
  let previousElapsed = 0;

  events.forEach((event, index) => {
    const currentElapsed = typeof event.elapsed_ms === "number" && Number.isFinite(event.elapsed_ms) ? event.elapsed_ms : null;
    const explicitDuration = getDetailNumber(event.details, "duration_ms");
    let durationMs = explicitDuration;

    if (durationMs === null) {
      if (currentElapsed !== null) {
        durationMs = Math.max(0, currentElapsed - (index === 0 ? 0 : previousElapsed));
      } else {
        durationMs = 0;
      }
    }

    if (currentElapsed !== null) {
      previousElapsed = Math.max(previousElapsed, currentElapsed);
    }

    const stageKey = event.stage || "unknown";
    const current = stageTotals.get(stageKey) || { totalMs: 0, eventCount: 0 };
    current.totalMs += durationMs;
    current.eventCount += 1;
    stageTotals.set(stageKey, current);
  });

  const measuredTotal = Array.from(stageTotals.values()).reduce((sum, item) => sum + item.totalMs, 0);
  const denominator = Math.max(measuredTotal, Number(runDurationMs || 0), 1);

  return Array.from(stageTotals.entries())
    .map(([stage, item]) => ({
      stage,
      label: getStageLabel(stage),
      totalMs: item.totalMs,
      eventCount: item.eventCount,
      share: Math.min(100, Math.round((item.totalMs / denominator) * 100)),
    }))
    .filter((item) => item.totalMs > 0 || item.eventCount > 0)
    .sort((left, right) => right.totalMs - left.totalMs || right.eventCount - left.eventCount);
}

function buildStallSignal(
  run: AnalysisHistoryRunSummary | null,
  events: AnalysisHistoryEvent[],
  isAnalyzing: boolean,
  nowMs: number,
): StallSignal | null {
  const active = Boolean(isAnalyzing || run?.status === "running");
  if (!run && !active) return null;

  const latestEvent = events.length > 0 ? events[events.length - 1] : null;
  const activeStage = latestEvent?.stage || run?.last_stage || "session";
  const stageLabel = getStageLabel(activeStage);
  const rule = getStageStallRule(activeStage);
  const latestTimestampMs =
    parseTimestamp(latestEvent?.timestamp) ?? parseTimestamp(run?.updated_at) ?? parseTimestamp(run?.started_at);

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

function summarizeDetails(event: AnalysisHistoryEvent) {
  const details = event.details || {};
  const fragments: string[] = [];
  if (typeof details.round !== "undefined") fragments.push(`round ${String(details.round)}`);
  if (typeof details.char_count !== "undefined") fragments.push(`${String(details.char_count)} chars`);
  if (typeof details.artifact_count !== "undefined") fragments.push(`${String(details.artifact_count)} artifacts`);
  if (typeof details.duration_ms !== "undefined") fragments.push(`${formatDuration(Number(details.duration_ms))}`);
  if (typeof details.error_type === "string" && details.error_type) fragments.push(`error ${details.error_type}`);
  return fragments.join(" | ");
}

export function AnalysisRuntimeSidebar({
  run,
  events,
  loading,
  isAnalyzing,
  onOpenFullHistory,
}: AnalysisRuntimeSidebarProps) {
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    setNowMs(Date.now());
    const active = Boolean(isAnalyzing || run?.status === "running");
    if (!active) return;
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [isAnalyzing, run?.status, run?.updated_at, events.length]);

  const orderedEvents = useMemo(() => [...events].sort((left, right) => left.sequence - right.sequence), [events]);
  const latestEvents = useMemo(() => [...orderedEvents].slice(-24).reverse(), [orderedEvents]);
  const stageTimingRank = useMemo(() => buildStageTimingRank(orderedEvents, run?.duration_ms), [orderedEvents, run?.duration_ms]);
  const stallSignal = useMemo(() => buildStallSignal(run, orderedEvents, isAnalyzing, nowMs), [run, orderedEvents, isAnalyzing, nowMs]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-gray-50 dark:bg-gray-900">
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 dark:border-gray-800 shrink-0">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2">
            <Workflow className="h-4 w-4 text-cyan-600" />
            分析过程
          </h2>
          {(isAnalyzing || run?.status === "running") ? (
            <div className="flex items-center gap-1 text-[11px] text-cyan-600 dark:text-cyan-400">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              <span>同步中</span>
            </div>
          ) : null}
        </div>
        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200" onClick={onOpenFullHistory}>
          <History className="mr-1 h-3.5 w-3.5" />
          全量历史
        </Button>
      </div>

      {!run ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center px-6 text-gray-400 dark:text-gray-500 gap-3">
          {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Activity className="h-8 w-8 text-cyan-500/70" />}
          <div className="space-y-1">
            <div className="text-sm text-gray-500 dark:text-gray-400">分析过程侧栏已就绪</div>
            <div className="text-xs leading-5 max-w-[260px]">
              发起新一轮分析后，这里会同步显示 run 的步骤流，包括提示词装配、LLM 生成推进、代码执行、报告补救和异常位置。
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="shrink-0 border-b border-gray-200 dark:border-gray-800 px-4 py-3 bg-white dark:bg-gray-950 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-xs font-medium text-gray-800 dark:text-gray-100 truncate">{run.run_id}</div>
                <div className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">session: {run.session_id}</div>
              </div>
              <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] ${statusClassMap[run.status] || statusClassMap.info}`}>{run.status}</span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-[11px] text-gray-500 dark:text-gray-400">
              <div className="rounded-md border border-gray-200 dark:border-gray-800 px-2 py-2 bg-gray-50 dark:bg-gray-900/40">
                <div className="flex items-center gap-1"><Clock3 className="h-3 w-3" /> 耗时</div>
                <div className="mt-1 text-gray-800 dark:text-gray-200">{formatDuration(run.duration_ms)}</div>
              </div>
              <div className="rounded-md border border-gray-200 dark:border-gray-800 px-2 py-2 bg-gray-50 dark:bg-gray-900/40">
                <div className="flex items-center gap-1"><Activity className="h-3 w-3" /> 事件数</div>
                <div className="mt-1 text-gray-800 dark:text-gray-200">{run.event_count || 0}</div>
              </div>
            </div>
            <div className="text-[11px] text-gray-500 dark:text-gray-400 space-y-1">
              <div>开始: <span className="text-gray-700 dark:text-gray-300">{formatDateTime(run.started_at)}</span></div>
              <div>最近阶段: <span className="text-gray-700 dark:text-gray-300">{getStageLabel(run.last_stage)} / {run.last_event || "-"}</span></div>
              {run.last_message ? <div>最近消息: <span className="text-gray-700 dark:text-gray-300">{run.last_message}</span></div> : null}
              {run.last_problem ? (
                <div className="flex items-start gap-1 text-amber-700 dark:text-amber-300">
                  <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span>{run.last_problem}</span>
                </div>
              ) : null}
            </div>

            {stallSignal ? (
              <div className={`rounded-lg border px-3 py-3 ${stallToneMap[stallSignal.level]}`}>
                <div className="flex items-start gap-2">
                  {stallSignal.level === "healthy" ? (
                    <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
                  ) : (
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  )}
                  <div className="min-w-0">
                    <div className="text-[11px] font-medium">{stallSignal.label}</div>
                    <div className="mt-1 text-[11px] leading-5">{stallSignal.message}</div>
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] opacity-80">
                      <span>专项规则: {stallSignal.rule.label}</span>
                      <span>关注阈值 {formatLag(stallSignal.rule.warningMs)}</span>
                      <span>告警阈值 {formatLag(stallSignal.rule.criticalMs)}</span>
                    </div>
                    {stallSignal.latestEvent ? (
                      <div className="mt-2 text-[10px] opacity-80">
                        最近事件: {stallSignal.stageLabel} / {stallSignal.latestEvent.event} · {formatDateTime(stallSignal.latestEvent.timestamp)}
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            ) : null}

            <div className="rounded-lg border border-gray-200 dark:border-gray-800 px-3 py-3 bg-gray-50 dark:bg-gray-900/40">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-1 text-[11px] text-gray-600 dark:text-gray-300">
                  <BarChart3 className="h-3.5 w-3.5 text-cyan-600" />
                  阶段耗时排行
                </div>
                <div className="text-[10px] text-gray-400 dark:text-gray-500">按事件耗时聚合</div>
              </div>

              {stageTimingRank.length === 0 ? (
                <div className="mt-3 text-[11px] leading-5 text-gray-500 dark:text-gray-400">当前 run 还没有可聚合的耗时数据，待更多事件写入后会自动更新。</div>
              ) : (
                <div className="mt-3 space-y-3">
                  {stageTimingRank.slice(0, 5).map((item, index) => {
                    const barWidth = item.totalMs > 0 ? Math.max(item.share, 8) : 0;
                    return (
                      <div key={item.stage} className="space-y-1.5">
                        <div className="flex items-center justify-between gap-3 text-[11px]">
                          <div className="min-w-0 flex items-center gap-2 text-gray-700 dark:text-gray-200">
                            <span className="w-4 shrink-0 text-gray-400 dark:text-gray-500">{index + 1}</span>
                            <span className="truncate">{item.label}</span>
                          </div>
                          <div className="shrink-0 text-gray-800 dark:text-gray-100">{formatDuration(item.totalMs)}</div>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-800">
                          <div className="h-full rounded-full bg-cyan-500 dark:bg-cyan-400" style={{ width: `${barWidth}%` }} />
                        </div>
                        <div className="flex items-center justify-between gap-3 text-[10px] text-gray-400 dark:text-gray-500">
                          <div>{item.eventCount} 个事件</div>
                          <div>{item.share}% of run</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="flex-1 min-h-0 overflow-auto px-3 py-3 space-y-2">
            {latestEvents.length === 0 ? (
              <div className="text-xs text-gray-500 dark:text-gray-400 leading-6">当前 run 尚未写入事件。若正在执行，几秒后会自动刷新。</div>
            ) : (
              latestEvents.map((event) => {
                const detailSummary = summarizeDetails(event);
                return (
                  <div key={`${event.run_id}-${event.sequence}`} className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 px-3 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-slate-900 text-white text-[10px] px-1.5">{event.sequence}</span>
                        <span className="truncate text-[11px] font-medium text-gray-800 dark:text-gray-100">{getStageLabel(event.stage)} / {event.event}</span>
                      </div>
                      <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] ${statusClassMap[event.status] || statusClassMap.info}`}>{event.status}</span>
                    </div>
                    <div className="mt-2 text-[11px] text-gray-700 dark:text-gray-300 leading-5 whitespace-pre-wrap">{event.message || "-"}</div>
                    <div className="mt-2 flex items-center justify-between gap-3 text-[10px] text-gray-400 dark:text-gray-500">
                      <div className="truncate">{detailSummary || "无附加摘要"}</div>
                      <div className="shrink-0">{formatDateTime(event.timestamp)}</div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div className="shrink-0 px-4 py-2 border-t border-gray-200 dark:border-gray-800 text-[10px] text-gray-500 dark:text-gray-400 flex items-center gap-2 bg-white dark:bg-gray-950">
            <ShieldCheck className="h-3.5 w-3.5 text-cyan-600" />
            这里显示运行态摘要；完整字段与原始 details 请在系统设置的“分析历史”中查看。
          </div>
        </>
      )}
    </div>
  );
}