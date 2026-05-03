"use client";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Sparkles, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

interface SideGuidanceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  text: string;
  onTextChange: (text: string) => void;
  history: string[];
  isSubmitting: boolean;
  onSubmit: () => void;
}

export function SideGuidanceDialog({
  open, onOpenChange, text, onTextChange, history, isSubmitting, onSubmit,
}: SideGuidanceDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-blue-600" />
            风调雨顺 - 过程指导
          </DialogTitle>
        </DialogHeader>
        <div className="py-2 text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
          在智能体分析过程中，您可以随时提交新的需求、方法或条件。
          这些信息将与当前任务结合，指导智能体的下一步动作。
        </div>

        {history.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 pt-2 pb-1 border-t border-gray-100 dark:border-gray-800">
            <span className="text-xs text-gray-400 mr-1">历史指导:</span>
            {history.map((h, i) => (
              <Button
                key={i}
                variant="ghost"
                size="sm"
                onClick={() => onTextChange(h)}
                className={cn(
                  "h-6 px-2 text-xs border border-gray-200 dark:border-gray-700 hover:bg-blue-50 dark:hover:bg-blue-900/20 hover:text-blue-600 dark:hover:text-blue-400",
                  text === h && "bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800"
                )}
                title={h.substring(0, 50) + (h.length > 50 ? "..." : "")}
              >
                &lt;{i + 1}&gt;
              </Button>
            ))}
          </div>
        )}

        <div className="py-4">
          <Textarea
            value={text}
            onChange={(e) => onTextChange(e.target.value)}
            placeholder="请输入您的过程指导要求或 Side Task..."
            className="min-h-[150px] resize-none focus-visible:ring-blue-500"
          />
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={() => {
              onOpenChange(false);
              onTextChange("");
            }}
          >
            取消
          </Button>
          <Button
            onClick={onSubmit}
            disabled={isSubmitting || !text.trim()}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            {isSubmitting ? (
              <>
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                提交中...
              </>
            ) : (
              "确认提交"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
