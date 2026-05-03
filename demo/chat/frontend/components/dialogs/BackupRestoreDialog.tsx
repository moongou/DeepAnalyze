"use client";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Trash2 } from "lucide-react";

interface BackupRestoreDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  backups: string[];
  selectedBackup: string;
  onSelectBackup: (name: string) => void;
  backupName: string;
  onBackupNameChange: (name: string) => void;
  restoreMode: "append" | "overwrite";
  onRestoreModeChange: (mode: "append" | "overwrite") => void;
  isCreatingBackup: boolean;
  onCreateBackup: () => void;
  onDeleteBackup: (name: string) => void;
  onRestore: () => void;
}

export function BackupRestoreDialog({
  open, onOpenChange, backups, selectedBackup, onSelectBackup,
  backupName, onBackupNameChange, restoreMode, onRestoreModeChange,
  isCreatingBackup, onCreateBackup, onDeleteBackup, onRestore,
}: BackupRestoreDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>雨途斩棘录 - 备份与恢复</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2 pb-2 border-b">
            <label className="text-sm font-medium">创建新备份</label>
            <div className="flex gap-2">
              <Input
                placeholder="备份名称 (可选)"
                value={backupName}
                onChange={(e) => onBackupNameChange(e.target.value)}
                className="flex-1"
              />
              <Button size="sm" onClick={onCreateBackup} disabled={isCreatingBackup}>
                {isCreatingBackup ? "备份中..." : "立即备份"}
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">现有备份</label>
            <div className="max-h-[200px] overflow-y-auto border rounded-md divide-y dark:divide-gray-800">
              {backups.length === 0 ? (
                <div className="p-4 text-center text-xs text-gray-500">暂无备份文件</div>
              ) : (
                backups.map(f => (
                  <div
                    key={f}
                    className={`flex items-center justify-between p-2 hover:bg-gray-50 dark:hover:bg-gray-900 cursor-pointer ${selectedBackup === f ? 'bg-blue-50 dark:bg-blue-900/20' : ''}`}
                    onClick={() => onSelectBackup(f)}
                  >
                    <div className="flex-1 text-xs truncate mr-2" title={f}>
                      {f}
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteBackup(f);
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))
              )}
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">恢复模式</label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="radio"
                  name="restoreMode"
                  checked={restoreMode === 'append'}
                  onChange={() => onRestoreModeChange('append')}
                />
                追加模式
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="radio"
                  name="restoreMode"
                  checked={restoreMode === 'overwrite'}
                  onChange={() => onRestoreModeChange('overwrite')}
                />
                覆盖模式
              </label>
            </div>
            <p className="text-[10px] text-gray-500">
              追加：仅导入不重复的记录。覆盖：清空当前库并完全替换。
            </p>
          </div>
          <Button
            className="w-full bg-blue-600 hover:bg-blue-700 mt-2"
            onClick={onRestore}
            disabled={!selectedBackup}
          >
            执行恢复
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
