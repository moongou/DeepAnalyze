"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Database, Loader2, RefreshCw, Search, Trash2 } from "lucide-react";

export interface DataDictionaryKnowledgeEntry {
  id: string;
  source_label?: string;
  table?: string;
  field?: string;
  meaning?: string;
  question?: string;
  confidence?: string;
  analysis_usage?: string;
  updated_at?: string;
  confirmed_at?: string;
  session_id?: string;
}

interface DataDictionarySettingsPanelProps {
  entries: DataDictionaryKnowledgeEntry[];
  total: number;
  isLoading: boolean;
  isDeleting: boolean;
  onRefresh: () => void;
  onDelete: (ids: string[]) => Promise<void>;
}

function formatDateTime(value?: string) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("zh-CN", { hour12: false });
}

export function DataDictionarySettingsPanel({
  entries,
  total,
  isLoading,
  isDeleting,
  onRefresh,
  onDelete,
}: DataDictionarySettingsPanelProps) {
  const [keyword, setKeyword] = useState("");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const sourceOptions = useMemo(() => {
    const values = Array.from(
      new Set(
        entries
          .map((item) => String(item.source_label || "").trim())
          .filter(Boolean)
      )
    );
    return values.sort((left, right) => left.localeCompare(right, "zh-CN"));
  }, [entries]);

  const filteredEntries = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase();

    return entries.filter((item) => {
      const sourceLabel = String(item.source_label || "").trim();
      if (sourceFilter !== "all" && sourceLabel !== sourceFilter) {
        return false;
      }

      if (!normalizedKeyword) {
        return true;
      }

      const blob = [
        item.id,
        sourceLabel,
        item.table,
        item.field,
        item.meaning,
        item.question,
        item.analysis_usage,
        item.confidence,
      ]
        .map((value) => String(value || "").toLowerCase())
        .join(" ");

      return blob.includes(normalizedKeyword);
    });
  }, [entries, keyword, sourceFilter]);

  useEffect(() => {
    setSelectedIds((prev) => {
      if (prev.size === 0) return prev;
      const validIdSet = new Set(entries.map((item) => item.id));
      const next = new Set(Array.from(prev).filter((id) => validIdSet.has(id)));
      return next;
    });
  }, [entries]);

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const selectAllVisible = () => {
    setSelectedIds(new Set(filteredEntries.map((item) => item.id)));
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
  };

  const handleDelete = async (ids: string[]) => {
    if (!ids.length) return;

    const confirmed = window.confirm(
      ids.length === 1
        ? "确认撤销这条已确认数据字典记录吗？"
        : `确认撤销选中的 ${ids.length} 条已确认数据字典记录吗？`
    );
    if (!confirmed) {
      return;
    }

    await onDelete(ids);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.delete(id));
      return next;
    });
  };

  return (
    <div className="mt-4 flex h-full min-h-0 flex-col gap-4 overflow-hidden">
      <section className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-gray-950">
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
              <Database className="h-4 w-4 text-cyan-600" />
              已确认数据字典管理
            </div>
            <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              可按数据源筛选并检索字段语义，支持撤销（删除）已确认条目。
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-full border border-slate-200 px-2.5 py-1 text-xs text-slate-600 dark:border-slate-700 dark:text-slate-300">
              总计 {total} 条
            </span>
            <Button variant="outline" size="sm" onClick={onRefresh} disabled={isLoading || isDeleting}>
              {isLoading ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-2 h-3.5 w-3.5" />}
              刷新
            </Button>
          </div>
        </div>

        <div className="grid gap-3 px-4 py-4 md:grid-cols-[1fr_220px_auto_auto_auto]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <Input
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder="搜索表名、字段、含义、问题或用途"
              className="pl-9"
            />
          </div>

          <Select value={sourceFilter} onValueChange={setSourceFilter}>
            <SelectTrigger>
              <SelectValue placeholder="按数据源筛选" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部数据源</SelectItem>
              {sourceOptions.map((source) => (
                <SelectItem key={source} value={source}>
                  {source}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button variant="outline" size="sm" onClick={selectAllVisible} disabled={!filteredEntries.length || isDeleting}>
            全选当前
          </Button>
          <Button variant="outline" size="sm" onClick={clearSelection} disabled={selectedIds.size === 0 || isDeleting}>
            清空选择
          </Button>
          <Button
            variant="destructive"
            size="sm"
            disabled={selectedIds.size === 0 || isDeleting}
            onClick={() => {
              void handleDelete(Array.from(selectedIds));
            }}
          >
            {isDeleting ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Trash2 className="mr-2 h-3.5 w-3.5" />}
            撤销选中
          </Button>
        </div>
      </section>

      <section className="min-h-0 flex-1 overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-gray-950">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
          <span>筛选结果 {filteredEntries.length} 条</span>
          <span>已选择 {selectedIds.size} 条</span>
        </div>

        <div className="h-full overflow-auto p-3">
          {isLoading ? (
            <div className="flex h-full items-center justify-center text-sm text-slate-500">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              正在加载数据字典...
            </div>
          ) : filteredEntries.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-slate-500">
              当前没有匹配的数据字典记录。
            </div>
          ) : (
            <div className="space-y-2">
              {filteredEntries.map((entry) => {
                const checked = selectedIds.has(entry.id);
                const subject = [entry.table, entry.field].filter(Boolean).join(".") || "(未命名字段)";

                return (
                  <div
                    key={entry.id}
                    className="rounded-lg border border-slate-200 p-3 dark:border-slate-800"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 flex-1 items-start gap-2">
                        <Checkbox checked={checked} onCheckedChange={() => toggleSelected(entry.id)} className="mt-0.5" />
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-full border border-slate-200 px-2 py-0.5 text-[10px] text-slate-600 dark:border-slate-700 dark:text-slate-300">[{entry.id}]</span>
                            <span className="text-sm font-medium text-slate-900 dark:text-slate-100">{subject}</span>
                            {entry.source_label ? (
                              <span className="rounded-full border border-cyan-200 bg-cyan-50 px-2 py-0.5 text-[10px] text-cyan-700 dark:border-cyan-900 dark:bg-cyan-950/30 dark:text-cyan-300">
                                {entry.source_label}
                              </span>
                            ) : null}
                            {entry.confidence ? (
                              <span className="text-[10px] text-slate-500 dark:text-slate-400">置信度: {entry.confidence}</span>
                            ) : null}
                          </div>
                          {entry.meaning ? (
                            <div className="mt-2 text-sm leading-6 text-slate-800 dark:text-slate-200">含义: {entry.meaning}</div>
                          ) : null}
                          {entry.question ? (
                            <div className="mt-1 text-xs leading-5 text-amber-700 dark:text-amber-300">待确认点: {entry.question}</div>
                          ) : null}
                          {entry.analysis_usage ? (
                            <div className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">分析用途: {entry.analysis_usage}</div>
                          ) : null}
                          <div className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">
                            最近更新时间: {formatDateTime(entry.updated_at || entry.confirmed_at)}
                          </div>
                        </div>
                      </div>

                      <Button
                        variant="outline"
                        size="sm"
                        className="shrink-0 text-rose-600 hover:text-rose-700"
                        disabled={isDeleting}
                        onClick={() => {
                          void handleDelete([entry.id]);
                        }}
                      >
                        <Trash2 className="mr-2 h-3.5 w-3.5" />
                        撤销
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
