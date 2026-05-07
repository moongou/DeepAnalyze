"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Database, Loader2, RefreshCw, Search, Trash2, Upload } from "lucide-react";

export interface DataDictionaryKnowledgeEntry {
  id: string;
  source_label?: string;
  table?: string;
  field?: string;
  code_explanation?: string;
  ai_understanding?: string;
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
  isImporting: boolean;
  onRefresh: () => void;
  onDelete: (ids: string[]) => Promise<void>;
  onSaveUnderstanding: (id: string, aiUnderstanding: string) => Promise<void>;
  onImportFile: (file: File) => Promise<void>;
}

function formatDateTime(value?: string) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("zh-CN", { hour12: false });
}

function getAiUnderstanding(entry: DataDictionaryKnowledgeEntry) {
  return String(entry.ai_understanding || entry.meaning || "").trim();
}

export function DataDictionarySettingsPanel({
  entries,
  total,
  isLoading,
  isDeleting,
  isImporting,
  onRefresh,
  onDelete,
  onSaveUnderstanding,
  onImportFile,
}: DataDictionarySettingsPanelProps) {
  const [keyword, setKeyword] = useState("");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingUnderstanding, setEditingUnderstanding] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

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
        item.code_explanation,
        item.ai_understanding,
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
      return new Set(Array.from(prev).filter((id) => validIdSet.has(id)));
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
        ? "确认删除这条数据字典理解记录吗？"
        : `确认删除选中的 ${ids.length} 条数据字典理解记录吗？`
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

  const startEditing = (entry: DataDictionaryKnowledgeEntry) => {
    setEditingId(entry.id);
    setEditingUnderstanding(getAiUnderstanding(entry));
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditingUnderstanding("");
  };

  const handleSave = async (entryId: string) => {
    setSavingId(entryId);
    try {
      await onSaveUnderstanding(entryId, editingUnderstanding.trim());
      setEditingId(null);
      setEditingUnderstanding("");
    } finally {
      setSavingId(null);
    }
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const nextFile = event.target.files?.[0];
    event.target.value = "";
    if (!nextFile) {
      return;
    }
    await onImportFile(nextFile);
  };

  return (
    <div className="mt-4 flex h-full min-h-0 flex-col gap-4 overflow-hidden">
      <section className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-gray-950">
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
              <Database className="h-4 w-4 text-cyan-600" />
              AI 理解的数据字典
            </div>
            <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              这里保存知识库中的字段释义，包括数据源、数据表、字段名、代码释义以及 AI 关联理解的数据定义。您修改并保存后的内容将作为后续分析的真实语义依据。
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-full border border-slate-200 px-2.5 py-1 text-xs text-slate-600 dark:border-slate-700 dark:text-slate-300">
              总计 {total} 条
            </span>
            <input
              ref={fileInputRef}
              type="file"
              aria-label="导入数据字典文件"
              accept=".csv,.xlsx,.xls,.json,application/json,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
              className="hidden"
              onChange={(event) => {
                void handleFileChange(event);
              }}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={isLoading || isDeleting || !!savingId || isImporting}
            >
              {isImporting ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Upload className="mr-2 h-3.5 w-3.5" />}
              导入 csv/xlsx/json
            </Button>
            <Button variant="outline" size="sm" onClick={onRefresh} disabled={isLoading || isDeleting || !!savingId || isImporting}>
              {isLoading ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-2 h-3.5 w-3.5" />}
              刷新
            </Button>
          </div>
        </div>

        <div className="border-b border-slate-100 px-4 py-2 text-[11px] leading-5 text-slate-500 dark:border-slate-900 dark:text-slate-400">
          支持上传 csv、xlsx、json 数据字典文件。列名可使用 数据源/source_label、数据表/table、字段名/field、代码释义/code_explanation、AI关联理解/ai_understanding 等常见命名。
        </div>

        <div className="grid gap-3 px-4 py-4 md:grid-cols-[1fr_220px_auto_auto_auto]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <Input
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder="搜索数据源、表名、字段、代码释义或 AI 理解"
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

          <Button variant="outline" size="sm" onClick={selectAllVisible} disabled={!filteredEntries.length || isDeleting || !!savingId || isImporting}>
            全选当前
          </Button>
          <Button variant="outline" size="sm" onClick={clearSelection} disabled={selectedIds.size === 0 || isDeleting || !!savingId || isImporting}>
            清空选择
          </Button>
          <Button
            variant="destructive"
            size="sm"
            disabled={selectedIds.size === 0 || isDeleting || !!savingId || isImporting}
            onClick={() => {
              void handleDelete(Array.from(selectedIds));
            }}
          >
            {isDeleting ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Trash2 className="mr-2 h-3.5 w-3.5" />}
            删除选中
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
              正在加载 AI 数据字典理解...
            </div>
          ) : filteredEntries.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-slate-500">
              当前没有匹配的数据字典记录。
            </div>
          ) : (
            <div className="space-y-3">
              {filteredEntries.map((entry) => {
                const checked = selectedIds.has(entry.id);
                const isEditing = editingId === entry.id;
                const aiUnderstanding = getAiUnderstanding(entry);

                return (
                  <div key={entry.id} className="rounded-lg border border-slate-200 p-4 dark:border-slate-800">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 flex-1 items-start gap-3">
                        <Checkbox checked={checked} onCheckedChange={() => toggleSelected(entry.id)} className="mt-1" />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-full border border-slate-200 px-2 py-0.5 text-[10px] text-slate-600 dark:border-slate-700 dark:text-slate-300">[{entry.id}]</span>
                            {entry.source_label ? (
                              <span className="rounded-full border border-cyan-200 bg-cyan-50 px-2 py-0.5 text-[10px] text-cyan-700 dark:border-cyan-900 dark:bg-cyan-950/30 dark:text-cyan-300">
                                {entry.source_label}
                              </span>
                            ) : null}
                            {entry.confidence ? (
                              <span className="text-[10px] text-slate-500 dark:text-slate-400">置信度: {entry.confidence}</span>
                            ) : null}
                          </div>

                          <div className="mt-3 grid gap-2 text-sm text-slate-700 dark:text-slate-300 md:grid-cols-3">
                            <div>
                              <div className="text-[11px] uppercase tracking-wide text-slate-400">数据表</div>
                              <div className="mt-1 font-medium text-slate-900 dark:text-slate-100">{entry.table || "-"}</div>
                            </div>
                            <div>
                              <div className="text-[11px] uppercase tracking-wide text-slate-400">字段名</div>
                              <div className="mt-1 font-medium text-slate-900 dark:text-slate-100">{entry.field || "-"}</div>
                            </div>
                            <div>
                              <div className="text-[11px] uppercase tracking-wide text-slate-400">最近更新</div>
                              <div className="mt-1 font-medium text-slate-900 dark:text-slate-100">{formatDateTime(entry.updated_at || entry.confirmed_at)}</div>
                            </div>
                          </div>

                          <div className="mt-4 rounded-lg bg-slate-50 p-3 dark:bg-slate-900/60">
                            <div className="text-[11px] uppercase tracking-wide text-slate-400">代码释义</div>
                            <div className="mt-1 text-sm leading-6 text-slate-700 dark:text-slate-300">
                              {entry.code_explanation || "-"}
                            </div>
                          </div>

                          <div className="mt-3 rounded-lg border border-cyan-100 bg-cyan-50/50 p-3 dark:border-cyan-950 dark:bg-cyan-950/10">
                            <div className="flex items-center justify-between gap-2">
                              <div className="text-[11px] uppercase tracking-wide text-cyan-700 dark:text-cyan-300">
                                AI 关联理解的数据定义
                              </div>
                              {!isEditing ? (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  disabled={isDeleting || !!savingId || isImporting}
                                  onClick={() => startEditing(entry)}
                                >
                                  编辑
                                </Button>
                              ) : null}
                            </div>

                            {isEditing ? (
                              <div className="mt-3 space-y-3">
                                <Textarea
                                  value={editingUnderstanding}
                                  onChange={(event) => setEditingUnderstanding(event.target.value)}
                                  placeholder="输入 AI 对该字段的理解，保存后将作为后续分析的真实语义依据。"
                                  className="min-h-[120px]"
                                />
                                <div className="flex items-center gap-2">
                                  <Button
                                    size="sm"
                                    disabled={savingId === entry.id || isImporting}
                                    onClick={() => {
                                      void handleSave(entry.id);
                                    }}
                                  >
                                    {savingId === entry.id ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : null}
                                    保存
                                  </Button>
                                  <Button variant="outline" size="sm" disabled={savingId === entry.id || isImporting} onClick={cancelEditing}>
                                    取消
                                  </Button>
                                </div>
                              </div>
                            ) : (
                              <div className="mt-2 text-sm leading-6 text-slate-700 dark:text-slate-200">
                                {aiUnderstanding || "-"}
                              </div>
                            )}
                          </div>

                          {entry.question ? (
                            <div className="mt-3 text-xs leading-5 text-amber-700 dark:text-amber-300">
                              分析备注: {entry.question}
                            </div>
                          ) : null}
                          {entry.analysis_usage ? (
                            <div className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                              分析用途: {entry.analysis_usage}
                            </div>
                          ) : null}
                        </div>
                      </div>

                      <Button
                        variant="outline"
                        size="sm"
                        className="shrink-0 text-rose-600 hover:text-rose-700"
                        disabled={isDeleting || !!savingId || isImporting}
                        onClick={() => {
                          void handleDelete([entry.id]);
                        }}
                      >
                        <Trash2 className="mr-2 h-3.5 w-3.5" />
                        删除
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
