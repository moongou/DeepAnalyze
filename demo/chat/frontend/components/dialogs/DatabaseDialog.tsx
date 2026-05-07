"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import { Database, RefreshCw, Sparkles, Play } from "lucide-react";

interface DbConfig {
  host: string;
  port: string;
  user: string;
  password: string;
  database: string;
}

interface DatabaseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dbType: string;
  onDbTypeChange: (type: string) => void;
  dbConfig: DbConfig;
  setDbConfig: (config: DbConfig) => void;
  getDefaultPort: (type: string) => string;
  availableDatabaseNames: string[];
  isLoadingDatabaseNames: boolean;
  databaseListError: string;
  dbContextSummary: string;
  isLoadingDbContext: boolean;
  onLoadDbContext: () => void;
  onFetchDatabaseNames: () => void;
  onTestConnection: () => void;
  isTestingDb: boolean;
  isDbTested: boolean;
  dbPrompt: string;
  setDbPrompt: (v: string) => void;
  onGenerateSql: () => void;
  isGeneratingSql: boolean;
  dbGeneratedSql: string;
  setDbGeneratedSql: (v: string) => void;
  dbDatasetName: string;
  setDbDatasetName: (v: string) => void;
  dbExecuteMode: "overwrite" | "append";
  setDbExecuteMode: (v: any) => void;
  onExecuteSql: () => void;
  isExecutingDbSql: boolean;
}

const DB_TYPES = [
  { id: "mysql", label: "MySQL", icon: "🐬" },
  { id: "mssql", label: "SQL Server", icon: "🪟" },
  { id: "postgresql", label: "PostgreSQL", icon: "🐘" },
  { id: "oracle", label: "Oracle", icon: "🏢" },
  { id: "sqlite", label: "SQLite", icon: "📂" },
];

export function DatabaseDialog({
  open, onOpenChange, dbType, onDbTypeChange, dbConfig, setDbConfig,
  getDefaultPort, availableDatabaseNames, isLoadingDatabaseNames, databaseListError,
  dbContextSummary, isLoadingDbContext, onLoadDbContext, onFetchDatabaseNames,
  onTestConnection, isTestingDb, isDbTested,
  dbPrompt, setDbPrompt, onGenerateSql, isGeneratingSql,
  dbGeneratedSql, setDbGeneratedSql, dbDatasetName, setDbDatasetName,
  dbExecuteMode, setDbExecuteMode, onExecuteSql, isExecutingDbSql,
}: DatabaseDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] w-[1400px] h-[75vh] p-0 overflow-hidden flex flex-col">
        <DialogHeader className="px-6 py-4 border-b">
          <DialogTitle className="flex items-center gap-2">
            <Database className="h-5 w-5 text-blue-600" />
            连接数据库并查询数据
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-hidden">
          <ResizablePanelGroup direction="horizontal" className="h-full">
            {/* 左侧：数据库类型选择 */}
            <ResizablePanel defaultSize={20} minSize={15} className="bg-gray-50 dark:bg-gray-900/20 border-r">
              <div className="p-4 space-y-4">
                <Label className="text-sm font-semibold">选择数据库类型</Label>
                <RadioGroup value={dbType} onValueChange={onDbTypeChange} className="space-y-2">
                  {DB_TYPES.map((item) => (
                    <div key={item.id} className="flex items-center space-x-2 p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                      <RadioGroupItem value={item.id} id={`db-${item.id}`} />
                      <Label htmlFor={`db-${item.id}`} className="flex-1 cursor-pointer flex items-center gap-2">
                        <span>{item.icon}</span>
                        <span>{item.label}</span>
                      </Label>
                    </div>
                  ))}
                </RadioGroup>
              </div>
            </ResizablePanel>

            <ResizableHandle withHandle />

            {/* 右侧：配置、NL输入、SQL编辑器 */}
            <ResizablePanel defaultSize={80} minSize={50}>
              <div className="h-full flex flex-col overflow-hidden">
                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                  {/* 1. 配置连接 */}
                  <section className="space-y-3">
                    <h3 className="text-sm font-semibold flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-[10px]">1</span>
                      配置连接信息
                    </h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <Label htmlFor="db-host">主机名 / 地址</Label>
                        <Input id="db-host" placeholder="localhost" value={dbConfig.host} onChange={(e) => setDbConfig({ ...dbConfig, host: e.target.value })} />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="db-port">端口</Label>
                        <Input id="db-port" placeholder={getDefaultPort(dbType)} value={dbConfig.port} onChange={(e) => setDbConfig({ ...dbConfig, port: e.target.value })} />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="db-user">用户名</Label>
                        <Input id="db-user" value={dbConfig.user} onChange={(e) => setDbConfig({ ...dbConfig, user: e.target.value })} />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="db-pass">密码</Label>
                        <Input id="db-pass" type="password" value={dbConfig.password} onChange={(e) => setDbConfig({ ...dbConfig, password: e.target.value })} />
                      </div>
                      <div className="col-span-2 space-y-1.5">
                        <Label htmlFor="db-name">{dbType === "sqlite" ? "SQLite 文件绝对路径" : "数据库名称"}</Label>
                        {dbType !== "sqlite" && availableDatabaseNames.length > 0 ? (
                          <Select
                            value={dbConfig.database || undefined}
                            onValueChange={(value) => setDbConfig({ ...dbConfig, database: value })}
                          >
                            <SelectTrigger id="db-name">
                              <SelectValue placeholder="请选择数据库名称" />
                            </SelectTrigger>
                            <SelectContent>
                              {availableDatabaseNames.map((name) => (
                                <SelectItem key={name} value={name}>
                                  {name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <Input id="db-name" value={dbConfig.database} onChange={(e) => setDbConfig({ ...dbConfig, database: e.target.value })} />
                        )}
                        {databaseListError ? <div className="text-xs text-amber-600">数据库列表加载失败：{databaseListError}</div> : null}
                      </div>
                    </div>
                    <div className="flex gap-2 justify-end">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={onLoadDbContext}
                        disabled={isLoadingDbContext}
                      >
                        {isLoadingDbContext ? <RefreshCw className="mr-2 h-3 w-3 animate-spin" /> : null}
                        将当前数据库所有信息作为上下文
                      </Button>
                      <Button variant="outline" size="sm" onClick={onFetchDatabaseNames} disabled={isLoadingDatabaseNames || dbType === "sqlite"}>
                        {isLoadingDatabaseNames ? <RefreshCw className="mr-2 h-3 w-3 animate-spin" /> : null}
                        刷新数据库列表
                      </Button>
                      <Button variant="outline" size="sm" onClick={onTestConnection} disabled={isTestingDb}>
                        {isTestingDb ? <RefreshCw className="mr-2 h-3 w-3 animate-spin" /> : null}
                        测试连接
                      </Button>
                    </div>
                    {dbContextSummary ? (
                      <div className="text-xs text-emerald-600 dark:text-emerald-400 text-right">{dbContextSummary}</div>
                    ) : null}
                  </section>

                  {/* 2. 自然语言生成 SQL */}
                  <section className={`space-y-3 transition-opacity ${!isDbTested ? 'opacity-50 pointer-events-none' : ''}`}>
                    <h3 className="text-sm font-semibold flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-[10px]">2</span>
                      智能生成查询语句
                      {!isDbTested && <span className="text-xs font-normal text-amber-600 ml-2">(请先完成步骤 1 测试连接)</span>}
                    </h3>
                    <div className="space-y-2">
                      <Textarea
                        placeholder="描述您的查询需求，例如：'统计过去三个月每个月的进出口额总计，并按月份排序'"
                        className="min-h-[80px] resize-none"
                        value={dbPrompt}
                        onChange={(e) => setDbPrompt(e.target.value)}
                      />
                      <div className="flex justify-end">
                        <Button size="sm" className="bg-blue-600 hover:bg-blue-700" onClick={onGenerateSql} disabled={isGeneratingSql || !dbPrompt.trim()}>
                          {isGeneratingSql ? <RefreshCw className="mr-2 h-3 w-3 animate-spin" /> : <Sparkles className="mr-2 h-3 w-3" />}
                          生成 SQL
                        </Button>
                      </div>
                    </div>
                  </section>

                  {/* 3. SQL 编辑与执行 */}
                  <section className={`space-y-3 transition-opacity ${!isDbTested ? 'opacity-50 pointer-events-none' : ''}`}>
                    <h3 className="text-sm font-semibold flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-[10px]">3</span>
                      预览并执行 SQL
                    </h3>
                    <div className="space-y-2">
                      <Textarea
                        className="min-h-[120px] font-mono text-sm"
                        value={dbGeneratedSql}
                        onChange={(e) => setDbGeneratedSql(e.target.value)}
                        spellCheck={false}
                      />
                      <div className="grid grid-cols-2 gap-4 items-end bg-gray-50 dark:bg-gray-900/40 p-4 rounded-lg border">
                        <div className="space-y-1.5">
                          <Label htmlFor="dataset-name">保存为数据集名称</Label>
                          <Input id="dataset-name" value={dbDatasetName} onChange={(e) => setDbDatasetName(e.target.value)} />
                        </div>
                        <div className="space-y-1.5">
                          <Label>执行模式</Label>
                          <Select value={dbExecuteMode} onValueChange={setDbExecuteMode}>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="overwrite">覆盖现有文件</SelectItem>
                              <SelectItem value="append">追加到现有文件</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </div>
                  </section>
                </div>

                <div className="px-6 py-4 border-t bg-gray-50 dark:bg-gray-950 flex justify-end gap-3">
                  <Button variant="ghost" onClick={() => onOpenChange(false)}>
                    关闭
                  </Button>
                  <Button
                    className="bg-green-600 hover:bg-green-700 text-white min-w-[120px]"
                    onClick={onExecuteSql}
                    disabled={isExecutingDbSql || !dbGeneratedSql.trim()}
                  >
                    {isExecutingDbSql ? (
                      <>
                        <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                        正在导入...
                      </>
                    ) : (
                      <>
                        <Play className="mr-2 h-4 w-4" />
                        立即执行并导入
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </ResizablePanel>
          </ResizablePanelGroup>
        </div>
      </DialogContent>
    </Dialog>
  );
}
