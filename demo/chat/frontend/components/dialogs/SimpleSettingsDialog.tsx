"use client";

import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BookOpen, Bot, Cpu, Database, Monitor, Settings, Sparkles, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

const ANALYSIS_PRINCIPLES = [
  { label: "自我纠错", desc: "自动检测错误并尝试修复，最多重试3次", key: "selfCorrectionEnabled" },
  { label: "短代码预测试", desc: "执行复杂分析前，先用小样本验证关键假设", key: "shortTestEnabled" },
  { label: "大任务拆分", desc: "将复杂目标分解为结构化任务树逐步执行", key: "taskDecompositionEnabled" },
  { label: "可解释性输出", desc: "输出特征重要性、判断依据链条等解释信息", key: "explainabilityEnabled" },
  { label: "高效处理", desc: "复用中间结果，避免重复代码，并行执行", key: "efficientProcessingEnabled" },
  { label: "死循环检测", desc: "自动检测并跳出分析死循环，更换分析策略", key: "deadLoopDetectionEnabled" },
] as const;

interface PrincipleStates {
  selfCorrectionEnabled: boolean;
  shortTestEnabled: boolean;
  taskDecompositionEnabled: boolean;
  explainabilityEnabled: boolean;
  efficientProcessingEnabled: boolean;
  deadLoopDetectionEnabled: boolean;
}

interface SimpleSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  modelVersion: string;
  setModelVersion: (v: string) => void;
  analysisMode: string;
  setAnalysisMode: (v: string) => void;
  analysisStrategy: string;
  setAnalysisStrategy: (v: string) => void;
  temperature: number | null;
  setTemperature: (v: number | null) => void;
  principles: PrincipleStates;
  onPrincipleChange: (key: keyof PrincipleStates, checked: boolean) => void;
  knowledgeBaseEnabled: boolean;
  setKnowledgeBaseEnabled: (v: boolean) => void;
}

export function SimpleSettingsDialog({
  open, onOpenChange, modelVersion, setModelVersion, analysisMode, setAnalysisMode,
  analysisStrategy, setAnalysisStrategy, temperature, setTemperature,
  principles, onPrincipleChange, knowledgeBaseEnabled, setKnowledgeBaseEnabled,
}: SimpleSettingsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[550px] max-h-[75vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            系统设置
          </DialogTitle>
          <DialogDescription>
            配置智能体的运行参数和分析行为
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-5 py-4">

          {/* 模型版本 */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Cpu className="h-4 w-4 text-blue-500" />
              模型运行环境
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => { setModelVersion("mlx"); localStorage.setItem("modelVersion", "mlx"); }}
                className={cn(
                  "flex flex-col items-center gap-1 p-3 rounded-lg border-2 transition-all text-xs",
                  modelVersion === "mlx"
                    ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300"
                    : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600"
                )}
              >
                <Monitor className="h-5 w-5" />
                <span className="font-medium">MLX (Apple Silicon)</span>
                <span className="text-[10px] text-gray-500">适用于 M1/M2/M3/M4 芯片</span>
              </button>
              <button
                onClick={() => { setModelVersion("gpu"); localStorage.setItem("modelVersion", "gpu"); }}
                className={cn(
                  "flex flex-col items-center gap-1 p-3 rounded-lg border-2 transition-all text-xs",
                  modelVersion === "gpu"
                    ? "border-green-500 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300"
                    : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600"
                )}
              >
                <Zap className="h-5 w-5" />
                <span className="font-medium">GPU (CUDA/OpenCL)</span>
                <span className="text-[10px] text-gray-500">适用于 NVIDIA/AMD 显卡</span>
              </button>
            </div>
          </div>

          {/* 分析模式 */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Bot className="h-4 w-4 text-purple-500" />
              分析模式
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => { setAnalysisMode("full_agent"); localStorage.setItem("analysisMode", "full_agent"); }}
                className={cn(
                  "flex flex-col items-start gap-1 p-3 rounded-lg border-2 transition-all text-xs",
                  analysisMode === "full_agent"
                    ? "border-purple-500 bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300"
                    : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600"
                )}
              >
                <span className="font-medium">全程代理</span>
                <span className="text-[10px] text-gray-500 text-left">智能体自主完成全部分析流程，无需人工干预</span>
              </button>
              <button
                onClick={() => { setAnalysisMode("interactive"); localStorage.setItem("analysisMode", "interactive"); }}
                className={cn(
                  "flex flex-col items-start gap-1 p-3 rounded-lg border-2 transition-all text-xs",
                  analysisMode === "interactive"
                    ? "border-orange-500 bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-300"
                    : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600"
                )}
              >
                <span className="font-medium">交互模式</span>
                <span className="text-[10px] text-gray-500 text-left">用户参与任务拆分与分析角度选择</span>
              </button>
            </div>
          </div>

          {/* 分析策略与热度 */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Sparkles className="h-4 w-4 text-amber-500" />
              分析策略与热度
            </div>
            <div className="flex items-center gap-3 p-3 border rounded-lg">
              <div className="flex-1 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500 w-16">策略:</span>
                  <Select value={analysisStrategy} onValueChange={setAnalysisStrategy}>
                    <SelectTrigger className="h-7 flex-1 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="聚焦诉求" className="text-xs">聚焦诉求 — 直击要点</SelectItem>
                      <SelectItem value="适度扩展" className="text-xs">适度扩展 — 兼顾关联</SelectItem>
                      <SelectItem value="广泛延展" className="text-xs">广泛延展 — 深度探索</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500 w-16">热度:</span>
                  <Slider
                    value={[temperature ?? (analysisStrategy === "聚焦诉求" ? 0.2 : analysisStrategy === "适度扩展" ? 0.4 : 0.6)]}
                    min={0.0}
                    max={1.0}
                    step={0.05}
                    onValueChange={(vals) => setTemperature(vals[0])}
                    className="flex-1 h-4"
                  />
                  <span className="text-xs text-gray-500 w-10 text-right">
                    {temperature !== null ? temperature.toFixed(2) : "auto"}
                  </span>
                  {temperature !== null && (
                    <button onClick={() => setTemperature(null)} className="text-xs text-gray-400 hover:text-gray-600" title="恢复自动">
                      ↺
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* 七大原则 */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <BookOpen className="h-4 w-4 text-teal-500" />
              智能体行为原则
            </div>
            <div className="space-y-1.5">
              {ANALYSIS_PRINCIPLES.map((item) => (
                <div key={item.key} className="flex items-center justify-between py-1.5 px-3 border rounded-lg">
                  <div>
                    <div className="text-xs font-medium">{item.label}</div>
                    <div className="text-[10px] text-gray-500">{item.desc}</div>
                  </div>
                  <Switch
                    checked={principles[item.key]}
                    onCheckedChange={(checked) => {
                      onPrincipleChange(item.key, checked);
                      localStorage.setItem(item.key, checked ? "true" : "false");
                    }}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* 知识库设置 */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Database className="h-4 w-4 text-indigo-500" />
              知识库与学习
            </div>
            <div className="flex items-center justify-between py-1.5 px-3 border rounded-lg">
              <div>
                <div className="text-xs font-medium">启用知识库（雨途斩棘录）</div>
                <div className="text-[10px] text-gray-500">启用后智能体会阅读历史错误经验</div>
              </div>
              <Switch
                checked={knowledgeBaseEnabled}
                onCheckedChange={(checked) => {
                  setKnowledgeBaseEnabled(checked);
                  localStorage.setItem("knowledgeBaseEnabled", checked ? "true" : "false");
                }}
              />
            </div>
          </div>

          {/* 输出格式说明 */}
          <div className="p-3 bg-gray-50 dark:bg-gray-900/30 rounded-lg">
            <div className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">输出规范</div>
            <ul className="text-[10px] text-gray-500 space-y-0.5">
              <li>• 所有分析输出使用简体中文</li>
              <li>• 报告支持 PDF、DOCX、PPTX 三种格式导出</li>
              <li>• 图表统一使用 seaborn 专业风格</li>
              <li>• 数据类型自动检测与校验</li>
              <li>• 机器学习模型附带特征重要性分析</li>
            </ul>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            关闭
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
