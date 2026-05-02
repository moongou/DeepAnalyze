"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

interface ProjectSaveDialogProps {
  showSaveDialog: boolean;
  setShowSaveDialog: (open: boolean) => void;
  projectName: string;
  setProjectName: (name: string) => void;
  userProjects: { id: number; name: string }[];
  onSave: () => void;
  // Overwrite confirmation
  saveConfirmOpen: boolean;
  setSaveConfirmOpen: (open: boolean) => void;
  setPendingSaveData: (data: any) => void;
  onConfirmOverwrite: () => void;
}

export function ProjectSaveDialog({
  showSaveDialog, setShowSaveDialog, projectName, setProjectName,
  userProjects, onSave,
  saveConfirmOpen, setSaveConfirmOpen, setPendingSaveData, onConfirmOverwrite,
}: ProjectSaveDialogProps) {
  return (
    <>
      <Dialog open={showSaveDialog} onOpenChange={setShowSaveDialog}>
        <DialogContent className="sm:max-w-[450px]">
          <DialogHeader>
            <DialogTitle>保存分析项目</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">项目名称</label>
              <div className="relative">
                <Input
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  placeholder="请输入或选择已有项目名称"
                  className="pr-10"
                />
                {userProjects.length > 0 && (
                  <div className="mt-2 max-h-[150px] overflow-y-auto border rounded-md p-1 bg-gray-50 dark:bg-gray-900">
                    <div className="text-[10px] text-gray-500 px-2 py-1 uppercase font-bold">已有项目 (点击覆盖)</div>
                    {userProjects.map(p => (
                      <button
                        key={p.id}
                        onClick={() => setProjectName(p.name)}
                        className="w-full text-left px-2 py-1.5 text-xs hover:bg-blue-100 dark:hover:bg-blue-900 rounded transition-colors truncate"
                      >
                        {p.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="text-[10px] text-gray-500 italic bg-amber-50 dark:bg-amber-950/20 p-2 rounded">
              提示：保存操作将同时记录当前的聊天历史、上传的数据文件以及生成的分析结果。
            </div>
            <Button className="w-full" onClick={onSave}>
              确认保存
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* 保存项目同名覆盖确认弹窗 */}
      <AlertDialog open={saveConfirmOpen} onOpenChange={setSaveConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>项目名称已存在</AlertDialogTitle>
            <AlertDialogDescription>
              项目中已存在名称为「{projectName}」的分析项目。覆盖将永久替换原项目内容，是否确认覆盖？
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => {
              setSaveConfirmOpen(false);
              setPendingSaveData(null);
            }}>
              取消
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-amber-600 hover:bg-amber-700"
              onClick={() => {
                setSaveConfirmOpen(false);
                onConfirmOverwrite();
              }}
            >
              确认覆盖
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
