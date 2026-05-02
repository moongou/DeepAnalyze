"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface AuthDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isLoggedIn: boolean;
  isLoginMode: boolean;
  authUsername: string;
  setAuthUsername: (v: string) => void;
  authPassword: string;
  setAuthPassword: (v: string) => void;
  registeredUsers: string[];
  onAuth: () => void;
  onToggleMode: () => void;
}

export function AuthDialog({
  open, onOpenChange, isLoggedIn, isLoginMode,
  authUsername, setAuthUsername, authPassword, setAuthPassword,
  registeredUsers, onAuth, onToggleMode,
}: AuthDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(open) => {
      if (!isLoggedIn && !open) return; // Prevent closing when not logged in
      onOpenChange(open);
    }}>
      <DialogContent className="sm:max-w-[450px]">
        <DialogHeader>
          <div className="flex flex-col items-center mb-4">
            <DialogTitle className="text-xl font-bold">雨途欢迎您一起前行</DialogTitle>
          </div>
        </DialogHeader>
        <div className="space-y-4 py-4">
          {/* 已注册用户快捷选择 */}
          {registeredUsers.length > 0 && (
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-500 dark:text-gray-400">
                {isLoginMode ? "已注册用户（点击快速登录）" : "已注册用户"}
              </label>
              <div className="flex flex-wrap gap-2 max-h-[100px] overflow-y-auto">
                {registeredUsers.map((u) => (
                  <button
                    key={u}
                    onClick={() => setAuthUsername(u)}
                    className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${
                      authUsername === u
                        ? "bg-blue-100 border-blue-400 text-blue-700 dark:bg-blue-900 dark:border-blue-600 dark:text-blue-200"
                        : "bg-gray-50 border-gray-200 text-gray-600 hover:bg-blue-50 hover:border-blue-200 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-blue-900/30"
                    }`}
                  >
                    {u}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="space-y-2">
            <label className="text-sm font-medium">用户名</label>
            <Input
              value={authUsername}
              onChange={(e) => setAuthUsername(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") onAuth(); }}
              placeholder="请输入用户名"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">密码</label>
            <Input
              type="password"
              value={authPassword}
              onChange={(e) => setAuthPassword(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") onAuth(); }}
              placeholder={isLoginMode ? "请输入密码（可为空）" : "最少 8 位密码"}
            />
          </div>
          <Button className="w-full" onClick={onAuth}>
            {isLoginMode ? "登录" : "注册"}
          </Button>
          <div className="text-center text-xs text-gray-500">
            {isLoginMode ? "没有账号？" : "已有账号？"}
            <button
              className="text-blue-600 hover:underline ml-1"
              onClick={onToggleMode}
            >
              {isLoginMode ? "立即注册" : "去登录"}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
