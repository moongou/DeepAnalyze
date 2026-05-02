"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { BookOpen } from "lucide-react";

interface KnowledgeSettingsDialogProps {
  showKnowledgeSettings: boolean;
  setShowKnowledgeSettings: (open: boolean) => void;
  knowledgeBaseEnabled: boolean;
  setKnowledgeBaseEnabled: (v: boolean) => void;
  currentUser: string | null;
  showEditDialog: boolean;
  setShowEditDialog: (open: boolean) => void;
  editRecord: any;
  setEditRecord: (r: any) => void;
  showDeleteConfirm: boolean;
  setShowDeleteConfirm: (open: boolean) => void;
  onUpdateRecord: (record: any) => void;
  onDeleteRecord: (hash: string) => void;
}

export function KnowledgeSettingsDialog({
  showKnowledgeSettings, setShowKnowledgeSettings, knowledgeBaseEnabled,
  setKnowledgeBaseEnabled, currentUser, showEditDialog, setShowEditDialog,
  editRecord, setEditRecord, showDeleteConfirm, setShowDeleteConfirm,
  onUpdateRecord, onDeleteRecord,
}: KnowledgeSettingsDialogProps) {
  const isSuperUser = currentUser === "rainforgrain";

  return (
    <>
      {/* 知识库设置弹窗 - 仅超级用户可见 */}
      <Dialog open={showKnowledgeSettings} onOpenChange={setShowKnowledgeSettings}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5" />
              知识库设置
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="flex items-center justify-between p-3 border rounded-lg">
              <div>
                <div className="text-sm font-medium">启用知识库</div>
                <div className="text-xs text-gray-500">启用后智能体启动时会阅读知识库</div>
              </div>
              <Switch
                checked={knowledgeBaseEnabled}
                onCheckedChange={(checked) => {
                  setKnowledgeBaseEnabled(checked);
                  localStorage.setItem("knowledgeBaseEnabled", checked ? "true" : "false");
                }}
              />
            </div>

            <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
              <div className="text-sm font-medium text-blue-700 dark:text-blue-300 mb-2">
                使用说明
              </div>
              <ul className="text-xs text-blue-600 dark:text-blue-400 space-y-1">
                <li>• 启用后，智能体在每次分析开始时会查询雨途斩棘录</li>
                <li>• "雨途斩棘录"按钮在分析完成后变为可用</li>
                <li>• 点击可自动提取分析过程中的问题和解决方案</li>
                <li>• 重复的记录会自动过滤，不会重复添加</li>
              </ul>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowKnowledgeSettings(false)}>
              关闭
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* 编辑记录对话框 - 超级用户专用 */}
      {isSuperUser && (
        <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
          <DialogContent className="sm:max-w-[600px]">
            <DialogHeader>
              <DialogTitle>编辑错误记录</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4 max-h-[70vh] overflow-y-auto">
              <div className="space-y-2">
                <label className="text-sm font-medium">错误类型</label>
                <Input
                  value={editRecord?.error_type || ""}
                  onChange={(e) => setEditRecord({ ...editRecord, error_type: e.target.value })}
                  placeholder="例如: ImportError"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">错误哈希</label>
                <Input
                  value={editRecord?.error_hash || ""}
                  disabled
                  className="bg-gray-100 dark:bg-gray-800"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">错误消息</label>
                <textarea
                  value={editRecord?.error_message || ""}
                  onChange={(e) => setEditRecord({ ...editRecord, error_message: e.target.value })}
                  className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 min-h-[80px]"
                  placeholder="错误消息..."
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">解决方案</label>
                <textarea
                  value={editRecord?.solution || ""}
                  onChange={(e) => setEditRecord({ ...editRecord, solution: e.target.value })}
                  className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 min-h-[100px]"
                  placeholder="解决方案描述..."
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">解决方案代码</label>
                <textarea
                  value={editRecord?.solution_code || ""}
                  onChange={(e) => setEditRecord({ ...editRecord, solution_code: e.target.value })}
                  className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 min-h-[120px] font-mono text-xs"
                  placeholder="解决方案代码..."
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">置信度 (0-1)</label>
                <Input
                  type="number"
                  min="0"
                  max="1"
                  step="0.1"
                  value={editRecord?.confidence || 0}
                  onChange={(e) => setEditRecord({ ...editRecord, confidence: parseFloat(e.target.value) || 0 })}
                />
              </div>
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setShowEditDialog(false)}>取消</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  onUpdateRecord(editRecord);
                  setShowEditDialog(false);
                }}
              >
                保存修改
              </AlertDialogAction>
            </AlertDialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* 删除确认对话框 */}
      {isSuperUser && (
        <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>确认删除记录？</AlertDialogTitle>
              <AlertDialogDescription>
                这将软删除该错误记录，使其在界面中不再显示。此操作可逆（通过数据库恢复）。
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>取消</AlertDialogCancel>
              <AlertDialogAction
                className="bg-red-600 hover:bg-red-700"
                onClick={() => {
                  if (editRecord?.error_hash) {
                    onDeleteRecord(editRecord.error_hash);
                  }
                  setShowDeleteConfirm(false);
                }}
              >
                确认删除
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </>
  );
}
