"use client";

import type React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BookOpen, Trash2 } from "lucide-react";

interface YutuPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentUser: string | null;
  yutuViewAsRegular: boolean;
  setYutuViewAsRegular: (v: boolean) => void;
  onInitYutu: () => void;
  onOrganizeNotes: () => void;
  isOrganizing: boolean;
  organizingProgress: string;
  organizeProgressPercent: number;
  onOpenBackupRestore: () => void;
  yutuRecords: any[];
  searchKeyword: string;
  setSearchKeyword: (v: string) => void;
  loadYutuRecords: (keywords: string[], errorType: string) => void;
  yutuHtmlContent: string;
  onDeleteRecord: (hash: string) => void;
  panelRef: React.RefObject<HTMLDivElement>;
}

export function YutuPanel({
  open, onOpenChange, currentUser, yutuViewAsRegular, setYutuViewAsRegular,
  onInitYutu, onOrganizeNotes, isOrganizing, organizingProgress, organizeProgressPercent,
  onOpenBackupRestore, yutuRecords, searchKeyword, setSearchKeyword, loadYutuRecords,
  yutuHtmlContent, onDeleteRecord, panelRef,
}: YutuPanelProps) {
  const isSuperUser = currentUser === "rainforgrain";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[90vw] max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5" />
            雨途斩棘录
            <span className="text-xs font-normal text-gray-500 dark:text-gray-400 ml-2">
              - 智能体错误修正记录知识库 -
            </span>
          </DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-hidden flex flex-col">
          {/* 管理工具栏 - 仅超级用户可见 */}
          {isSuperUser && (
            <div className="flex items-center justify-between gap-2 mb-2 px-1">
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant={yutuViewAsRegular ? "outline" : "default"}
                  onClick={() => setYutuViewAsRegular(!yutuViewAsRegular)}
                  className={yutuViewAsRegular ? "" : "bg-blue-600"}
                >
                  {yutuViewAsRegular ? "管理模式" : "查看HTML"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={onInitYutu}
                  className="text-orange-600 border-orange-200 hover:bg-orange-50"
                >
                  初始化知识库
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-green-600 border-green-200 hover:bg-green-50 relative overflow-hidden"
                  onClick={() => {
                    if (window.confirm("确定要整理所有笔记吗？这将使用AI重新组织所有记录。")) {
                      onOrganizeNotes();
                    }
                  }}
                  disabled={isOrganizing}
                >
                  {isOrganizing ? (
                    <>
                      <div
                        className="absolute left-0 top-0 bottom-0 bg-green-100 opacity-50 transition-all duration-300 ease-out"
                        style={{ width: `${organizeProgressPercent}%` }}
                      />
                      <span className="relative z-10 flex items-center">
                        <span className="animate-spin mr-1">⏳</span>
                        {organizingProgress} ({organizeProgressPercent}%)
                      </span>
                    </>
                  ) : (
                    "整理笔记"
                  )}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-purple-600 border-purple-200 hover:bg-purple-50"
                  onClick={onOpenBackupRestore}
                >
                  备份与恢复
                </Button>
              </div>
              <span className="text-xs text-gray-500">共 {yutuRecords.length} 条记录</span>
            </div>
          )}

          {/* 搜索栏 - 仅超级用户可见 */}
          {isSuperUser && (
            <div className="flex items-center gap-2 mb-3 p-2 border rounded-md bg-gray-50 dark:bg-gray-900">
              <Input
                placeholder="搜索错误消息..."
                value={searchKeyword}
                onChange={(e) => setSearchKeyword(e.target.value)}
                className="flex-1"
              />
              <Button
                size="sm"
                onClick={() => loadYutuRecords(searchKeyword ? [searchKeyword] : [], "")}
              >
                搜索
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setSearchKeyword("");
                  loadYutuRecords([], "");
                }}
              >
                重置
              </Button>
            </div>
          )}

          {/* 内容显示区域 */}
          {isSuperUser && !yutuViewAsRegular ? (
            <div className="flex-1 min-h-0 overflow-auto rounded-md border bg-white dark:bg-gray-950">
              {yutuRecords.length > 0 ? (
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 dark:bg-gray-900 sticky top-0">
                    <tr>
                      <th className="px-3 py-2 text-left">错误类型</th>
                      <th className="px-3 py-2 text-left">错误消息</th>
                      <th className="px-3 py-2 text-left">解决方案</th>
                      <th className="px-3 py-2 text-center">置信度</th>
                      <th className="px-3 py-2 text-center">使用次数</th>
                      <th className="px-3 py-2 text-center">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                    {yutuRecords.map((record: any) => (
                      <tr key={record.error_hash} className="bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800">
                        <td className="px-3 py-2">
                          <span className={`px-2 py-0.5 text-xs rounded ${
                            record.error_type === 'ImportError' ? 'bg-blue-100 text-blue-700' :
                            record.error_type === 'ValueError' ? 'bg-red-100 text-red-700' :
                            record.error_type === 'TypeError' ? 'bg-orange-100 text-orange-700' :
                            'bg-gray-100 text-gray-700'
                          }`}>
                            {record.error_type || "Unknown"}
                          </span>
                        </td>
                        <td className="px-3 py-2 max-w-[200px] truncate" title={record.error_message || ""}>
                          {record.error_message ? record.error_message.substring(0, 50) + (record.error_message.length > 50 ? "..." : "") : ""}
                        </td>
                        <td className="px-3 py-2 max-w-[250px] truncate" title={record.solution || ""}>
                          {record.solution ? record.solution.substring(0, 80) + (record.solution.length > 80 ? "..." : "") : ""}
                        </td>
                        <td className="px-3 py-2 text-center">
                          <span className={`px-2 py-0.5 text-xs rounded ${
                            (record.confidence || 0) >= 0.8 ? 'bg-green-100 text-green-700' :
                            (record.confidence || 0) >= 0.5 ? 'bg-yellow-100 text-yellow-700' :
                            'bg-red-100 text-red-700'
                          }`}>
                            {Math.round((record.confidence || 0) * 100)}%
                          </span>
                        </td>
                        <td className="px-3 py-2 text-center text-gray-500">
                          {record.usage_count || 0}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex items-center justify-center gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 w-6 p-0 text-red-500 hover:text-red-600"
                              onClick={() => onDeleteRecord(record.error_hash)}
                              title="删除"
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-gray-500 p-8">
                  <BookOpen className="h-12 w-12 mb-4 opacity-30" />
                  <p>暂无错误记录</p>
                  <p className="text-xs mt-2">当智能体遇到错误并成功解决后，记录将自动添加到这里</p>
                </div>
              )}
            </div>
          ) : (
            <div ref={panelRef} className="flex-1 min-h-0 overflow-auto rounded-md border bg-white dark:bg-gray-950">
              {yutuHtmlContent ? (
                <div className="p-4 prose prose-sm dark:prose-invert max-w-none" dangerouslySetInnerHTML={{ __html: yutuHtmlContent }} />
              ) : (
                <div className="h-full flex items-center justify-center text-gray-500">
                  加载中...
                </div>
              )}
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 mt-3">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            关闭
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
