"use client";

import { memo } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BookCheck } from "lucide-react";

export interface DataDictionaryItem {
  id: string;
  source_label?: string;
  table?: string;
  field?: string;
  proposed_meaning?: string;
  question?: string;
  confidence?: string;
  analysis_usage?: string;
}

export interface DataDictionaryPayload {
  items: DataDictionaryItem[];
}

export function parseDataDictionaryContent(raw: string): DataDictionaryPayload | null {
  if (!raw) return null;
  let text = raw.trim();

  text = text.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?\s*```\s*$/, "");
  text = text.trim();

  const normalize = (payload: unknown): DataDictionaryPayload | null => {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return null;
    }
    const data = payload as Record<string, unknown>;
    const rawItems = data.items;
    if (!Array.isArray(rawItems)) {
      return null;
    }

    const items: DataDictionaryItem[] = [];
    for (const rawItem of rawItems) {
      if (!rawItem || typeof rawItem !== "object" || Array.isArray(rawItem)) {
        continue;
      }
      const item = rawItem as Record<string, unknown>;
      const idValue = String(item.id || "").trim();
      const table = String(item.table || item.table_name || "").trim();
      const field = String(item.field || item.column || item.field_name || "").trim();
      const proposedMeaning = String(item.proposed_meaning || item.meaning || item.description || "").trim();
      if (!idValue && !table && !field && !proposedMeaning) {
        continue;
      }

      items.push({
        id: idValue || `${table}.${field}` || `item-${items.length + 1}`,
        source_label: String(item.source_label || item.source || "").trim(),
        table,
        field,
        proposed_meaning: proposedMeaning,
        question: String(item.question || item.confirm_question || "").trim(),
        confidence: String(item.confidence || "").trim(),
        analysis_usage: String(item.analysis_usage || item.usage || "").trim(),
      });
    }

    if (items.length === 0) {
      return null;
    }
    return { items };
  };

  try {
    const parsed = JSON.parse(text);
    const normalized = normalize(parsed);
    if (normalized) return normalized;
  } catch {
    // ignore and continue heuristic extraction
  }

  const firstBrace = text.indexOf("{");
  if (firstBrace !== -1) {
    let depth = 0;
    let lastBrace = -1;
    for (let i = firstBrace; i < text.length; i++) {
      if (text[i] === "{") depth++;
      else if (text[i] === "}") {
        depth--;
        if (depth === 0) {
          lastBrace = i;
          break;
        }
      }
    }

    if (lastBrace !== -1) {
      try {
        const candidate = text.slice(firstBrace, lastBrace + 1);
        const parsed = JSON.parse(candidate);
        const normalized = normalize(parsed);
        if (normalized) return normalized;
      } catch {
        // keep fallback
      }
    }
  }

  const itemsMatch = text.match(/"items"\s*:\s*(\[[\s\S]*\])/);
  if (itemsMatch) {
    try {
      const parsedItems = JSON.parse(itemsMatch[1]);
      const normalized = normalize({ items: parsedItems });
      if (normalized) return normalized;
    } catch {
      return null;
    }
  }

  return null;
}

const DataDictionaryListItem = memo(function DataDictionaryListItem({
  item,
  checked,
  toggle,
  updateItem,
  language,
}: {
  item: DataDictionaryItem;
  checked: boolean;
  toggle: (id: string) => void;
  updateItem: (id: string, patch: Partial<DataDictionaryItem>) => void;
  language: "zh-CN" | "en";
}) {
  const subject = [item.table, item.field].filter(Boolean).join(".") || "(未命名字段)";
  const isEnglish = language === "en";

  return (
    <div className="rounded-md border border-slate-200 dark:border-slate-800 p-3 space-y-2">
      <div className="flex items-start gap-2">
        <Checkbox checked={checked} onCheckedChange={() => toggle(item.id)} className="mt-0.5" />
        <div className="min-w-0 flex-1 space-y-1">
          <div className="text-sm font-medium text-slate-800 dark:text-slate-200 break-all">
            <span className="text-amber-600 dark:text-amber-400 mr-2">[{item.id}]</span>
            {subject}
          </div>
          {item.source_label ? (
            <div className="text-xs text-slate-500 dark:text-slate-400 break-all">{isEnglish ? "Source:" : "数据源："}{item.source_label}</div>
          ) : null}

          <div className="grid gap-2 pt-1 md:grid-cols-2">
            <div className="space-y-1">
              <div className="text-[11px] text-slate-500 dark:text-slate-400">{isEnglish ? "Business Meaning" : "业务含义"}</div>
              <Input
                value={item.proposed_meaning || ""}
                onChange={(event) => updateItem(item.id, { proposed_meaning: event.target.value })}
                placeholder={isEnglish ? "Edit inferred meaning" : "可修改推测业务含义"}
                className="h-8"
              />
            </div>
            <div className="space-y-1">
              <div className="text-[11px] text-slate-500 dark:text-slate-400">{isEnglish ? "Confidence" : "置信度"}</div>
              <Select
                value={item.confidence || "unknown"}
                onValueChange={(value) => updateItem(item.id, { confidence: value === "unknown" ? "" : value })}
              >
                <SelectTrigger className="h-8">
                  <SelectValue placeholder={isEnglish ? "Select confidence" : "选择置信度"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="unknown">{isEnglish ? "Unknown" : "未标注"}</SelectItem>
                  <SelectItem value="low">low</SelectItem>
                  <SelectItem value="medium">medium</SelectItem>
                  <SelectItem value="high">high</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1">
            <div className="text-[11px] text-slate-500 dark:text-slate-400">{isEnglish ? "Question to Confirm" : "待确认点"}</div>
            <Input
              value={item.question || ""}
              onChange={(event) => updateItem(item.id, { question: event.target.value })}
              placeholder={isEnglish ? "What should be confirmed by user" : "可修改需要用户确认的问题"}
              className="h-8"
            />
          </div>

          <div className="space-y-1">
            <div className="text-[11px] text-slate-500 dark:text-slate-400">{isEnglish ? "Analysis Usage" : "分析用途"}</div>
            <Textarea
              value={item.analysis_usage || ""}
              onChange={(event) => updateItem(item.id, { analysis_usage: event.target.value })}
              placeholder={isEnglish ? "How this semantics affects analysis" : "可修改该语义对分析任务的影响"}
              className="min-h-[64px] resize-y text-xs"
            />
          </div>
        </div>
      </div>
    </div>
  );
});

interface DataDictionaryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  language?: "zh-CN" | "en";
  items: DataDictionaryItem[];
  selectedIds: Set<string>;
  toggleItem: (id: string) => void;
  updateItem: (id: string, patch: Partial<DataDictionaryItem>) => void;
  selectAll: () => void;
  clearAll: () => void;
  onConfirm: () => void;
}

export function DataDictionaryDialog({
  open,
  onOpenChange,
  language = "zh-CN",
  items,
  selectedIds,
  toggleItem,
  updateItem,
  selectAll,
  clearAll,
  onConfirm,
}: DataDictionaryDialogProps) {
  const isEnglish = language === "en";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[720px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BookCheck className="h-5 w-5 text-amber-600" />
            {isEnglish ? "Confirm Data Dictionary" : "确认数据字典"}
          </DialogTitle>
          <DialogDescription>
            {isEnglish
              ? "Review and edit inferred meanings item by item before confirming."
              : "请先逐条检查并修正推测语义，再确认进入深度分析。"}
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2 py-2 border-b border-slate-200 dark:border-slate-800">
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={selectAll}>
            {isEnglish ? "Select all" : "全选"}
          </Button>
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={clearAll}>
            {isEnglish ? "Clear" : "清空"}
          </Button>
          <span className="ml-auto text-xs text-slate-500 dark:text-slate-400">
            {isEnglish ? `Selected ${selectedIds.size}` : `已选择 ${selectedIds.size} 条`}
          </span>
        </div>

        <div className="max-h-[56vh] overflow-y-auto space-y-2 py-2">
          {items.map((item) => (
            <DataDictionaryListItem
              key={item.id}
              item={item}
              checked={selectedIds.has(item.id)}
              toggle={toggleItem}
              updateItem={updateItem}
              language={language}
            />
          ))}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {isEnglish ? "Cancel" : "取消"}
          </Button>
          <Button
            onClick={onConfirm}
            disabled={selectedIds.size === 0}
            className="bg-amber-600 hover:bg-amber-700 text-white disabled:opacity-50"
          >
            {isEnglish ? "Confirm and Continue" : "确认并继续分析"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
