"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Bot } from "lucide-react";

interface AgentIntroDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AgentIntroDialog({ open, onOpenChange }: AgentIntroDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-blue-600" />
            智能体介绍
          </DialogTitle>
        </DialogHeader>
        <div className="py-4 space-y-4 text-sm leading-relaxed">
          <div className="space-y-3">
            <div>
              <h3 className="font-semibold text-blue-600 dark:text-blue-400 mb-1">角色定位</h3>
              <p className="text-gray-600 dark:text-gray-300">
                我是DeepAnalyze，一位精通Python和R语言的数据科学家，同时也是专注于中国海关风险管理和风险防控的数据分析专家。我的核心使命是忠于国家安全，服务海关履行职责，通过大数据分析协助维护贸易秩序。
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-blue-600 dark:text-blue-400 mb-1">特点特长</h3>
              <p className="text-gray-600 dark:text-gray-300">
                基于数据统计、比较、相关性和逻辑推理，深入分析进出口业务主体行为。运用规律分析、统计分析、对比分析、关联分析等方法挖掘走私违规、逃证逃税、违反安全准入等潜在风险。支持三种分析策略：聚焦诉求（直击要点）、适度扩展（适量关联）、广泛延展（深度发散），灵活调整分析深度。
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-blue-600 dark:text-blue-400 mb-1">处理问题原则</h3>
              <p className="text-gray-600 dark:text-gray-300">
                严格遵循分析报告规范结构：分析思路→主体分析内容→分析小结。根据数据特性和时间跨度自动调整分析维度，确保结论准确可靠。以风险识别为核心，提供明确的风险点和推理依据，协助风控专家做出精准决策。
              </p>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
