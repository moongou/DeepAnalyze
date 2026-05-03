"use client";

import { memo } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { ListTree } from "lucide-react";

export interface TaskTreeNode {
  id: string;
  name: string;
  description: string;
  children?: TaskTreeNode[];
}

/**
 * Robustly extract task tree JSON from content that may contain
 * extra text, markdown code fences, or other non-JSON material.
 * Returns parsed { tasks: TaskTreeNode[] } or null.
 */
export function parseTaskTreeContent(raw: string): { tasks: TaskTreeNode[] } | null {
  if (!raw) return null;
  let text = raw.trim();

  // Strip markdown code fences if present (```json ... ``` or ``` ... ```)
  text = text.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?\s*```\s*$/, "");
  text = text.trim();

  // Try direct parse first (ideal case: content is pure JSON)
  try {
    const parsed = JSON.parse(text);
    if (parsed && Array.isArray(parsed.tasks)) return parsed;
  } catch { /* continue to heuristic extraction */ }

  // Heuristic: find the outermost { ... } that contains "tasks"
  const firstBrace = text.indexOf("{");
  if (firstBrace === -1) return null;

  // Find matching closing brace by counting
  let depth = 0;
  let lastBrace = -1;
  for (let i = firstBrace; i < text.length; i++) {
    if (text[i] === "{") depth++;
    else if (text[i] === "}") {
      depth--;
      if (depth === 0) { lastBrace = i; break; }
    }
  }

  if (lastBrace === -1) return null;

  try {
    const jsonStr = text.slice(firstBrace, lastBrace + 1);
    const parsed = JSON.parse(jsonStr);
    if (parsed && Array.isArray(parsed.tasks)) return parsed;
  } catch { /* fall through */ }

  // Last resort: try to find a JSON array for "tasks" key
  const tasksMatch = text.match(/"tasks"\s*:\s*(\[[\s\S]*\])/);
  if (tasksMatch) {
    try {
      const tasks = JSON.parse(tasksMatch[1]);
      if (Array.isArray(tasks)) return { tasks };
    } catch { /* give up */ }
  }

  return null;
}

// TaskTree 任务节点组件
export const TaskTreeItem = memo(function TaskTreeItem({
  node,
  selectedTasks,
  toggleTask,
  depth,
}: {
  node: TaskTreeNode;
  selectedTasks: Set<string>;
  toggleTask: (id: string, node: TaskTreeNode) => void;
  depth: number;
}) {
  const isChecked = selectedTasks.has(node.id);
  const hasChildren = node.children && node.children.length > 0;
  const allChildrenChecked = hasChildren && node.children!.every(c => selectedTasks.has(c.id));

  return (
    <div style={{ paddingLeft: depth * 20 }}>
      <div className="flex items-center gap-2 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-900 rounded px-2">
        <Checkbox
          checked={hasChildren ? allChildrenChecked : isChecked}
          onCheckedChange={() => toggleTask(node.id, node)}
          className="data-[state=checked]:bg-amber-600 data-[state=checked]:border-amber-600"
        />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-gray-800 dark:text-gray-200">
            <span className="text-amber-600 dark:text-amber-400 mr-1 font-mono">[{node.id}]</span>
            {node.name}
          </div>
          {node.description && (
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">{node.description}</div>
          )}
        </div>
      </div>
      {hasChildren && (
        <div>
          {node.children!.map(child => (
            <TaskTreeItem
              key={child.id}
              node={child}
              selectedTasks={selectedTasks}
              toggleTask={toggleTask}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
});

interface TaskTreeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  taskTreeData: TaskTreeNode[] | null;
  language?: "zh-CN" | "en";
  selectedTasks: Set<string>;
  toggleTask: (id: string, node: TaskTreeNode) => void;
  selectAllTasks: () => void;
  deselectAllTasks: () => void;
  onConfirm: () => void;
}

export function TaskTreeDialog({
  open, onOpenChange, taskTreeData, language = "zh-CN", selectedTasks, toggleTask,
  selectAllTasks, deselectAllTasks, onConfirm,
}: TaskTreeDialogProps) {
  const isEnglish = language === "en";
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ListTree className="h-5 w-5 text-amber-600" />
            {isEnglish ? "Select Analysis Tasks" : "选择分析任务"}
          </DialogTitle>
          <DialogDescription>
            {isEnglish
              ? "Choose the tasks you want the agent to execute. It will only run the selected tasks after confirmation."
              : "请选择您希望智能体执行的分析任务，确认后智能体将仅分析选定的任务"}
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2 py-2 border-b border-gray-100 dark:border-gray-800">
          <Button variant="outline" size="sm" onClick={selectAllTasks} className="text-xs h-7">
            {isEnglish ? "Select all" : "全选"}
          </Button>
          <Button variant="outline" size="sm" onClick={deselectAllTasks} className="text-xs h-7">
            {isEnglish ? "Clear all" : "取消全选"}
          </Button>
          <span className="ml-auto text-xs text-gray-500 dark:text-gray-400">
            {isEnglish ? `Selected ${selectedTasks.size}` : `已选 ${selectedTasks.size} 项`}
          </span>
        </div>

        <div className="py-2 overflow-y-auto max-h-[50vh]">
          {taskTreeData?.map(node => (
            <TaskTreeItem
              key={node.id}
              node={node}
              selectedTasks={selectedTasks}
              toggleTask={toggleTask}
              depth={0}
            />
          ))}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {isEnglish ? "Cancel" : "取消"}
          </Button>
          <Button
            onClick={onConfirm}
            disabled={selectedTasks.size === 0}
            className="bg-amber-600 hover:bg-amber-700 text-white disabled:opacity-50"
          >
            {isEnglish ? "Confirm" : "确认选择"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
