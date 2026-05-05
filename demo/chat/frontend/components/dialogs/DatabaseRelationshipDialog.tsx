"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Database, GitBranch, Grip, KeyRound, Link2, RefreshCw, Search } from "lucide-react";

interface SchemaColumn {
  name: string;
  type: string;
  nullable?: boolean;
  is_pk?: boolean;
  definition?: string;
}

interface SchemaTable {
  id: string;
  schema?: string;
  name: string;
  display_name?: string;
  row_count?: number | null;
  columns: SchemaColumn[];
}

interface SchemaRelationship {
  id: string;
  name: string;
  source_table_id: string;
  source_columns: string[];
  target_table_id: string;
  target_columns: string[];
  relationship_type?: string;
}

interface SchemaGraph {
  source_label?: string;
  db_type?: string;
  database?: string;
  generated_at?: string;
  summary?: string;
  tables: SchemaTable[];
  relationships: SchemaRelationship[];
}

interface DatabaseRelationshipDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  graph: SchemaGraph | null;
  loading: boolean;
  onRefresh: () => void;
}

const CARD_WIDTH = 260;
const CARD_HEIGHT = 196;
const HORIZONTAL_GAP = 96;
const VERTICAL_GAP = 78;
const CANVAS_PADDING = 44;

type LayoutMode = "relationship" | "schema" | "grid";

const LAYOUT_MODES: Array<{ id: LayoutMode; label: string }> = [
  { id: "relationship", label: "关系优先" },
  { id: "schema", label: "按 Schema" },
  { id: "grid", label: "网格平铺" },
];

function buildBaseTablePositions(
  tables: SchemaTable[],
  relationships: SchemaRelationship[],
  layoutMode: LayoutMode
) {
  const positions: Record<string, { x: number; y: number }> = {};
  if (!tables.length) {
    return positions;
  }

  if (layoutMode === "schema") {
    const grouped = new Map<string, SchemaTable[]>();
    tables.forEach((table) => {
      const schemaKey = table.schema || "default";
      const bucket = grouped.get(schemaKey) || [];
      bucket.push(table);
      grouped.set(schemaKey, bucket);
    });
    Array.from(grouped.entries())
      .sort(([left], [right]) => left.localeCompare(right))
      .forEach(([_, group], groupIndex) => {
        group.forEach((table, tableIndex) => {
          positions[table.id] = {
            x: CANVAS_PADDING + groupIndex * (CARD_WIDTH + HORIZONTAL_GAP + 34),
            y: CANVAS_PADDING + tableIndex * (CARD_HEIGHT + VERTICAL_GAP * 0.8),
          };
        });
      });
    return positions;
  }

  if (layoutMode === "relationship") {
    const degrees = new Map<string, number>();
    relationships.forEach((relationship) => {
      degrees.set(relationship.source_table_id, (degrees.get(relationship.source_table_id) || 0) + 1);
      degrees.set(relationship.target_table_id, (degrees.get(relationship.target_table_id) || 0) + 1);
    });
    const strong = tables.filter((table) => (degrees.get(table.id) || 0) >= 2);
    const linked = tables.filter((table) => (degrees.get(table.id) || 0) === 1);
    const isolated = tables.filter((table) => (degrees.get(table.id) || 0) === 0);
    [strong, linked, isolated].forEach((bucket, columnIndex) => {
      bucket.forEach((table, rowIndex) => {
        positions[table.id] = {
          x: CANVAS_PADDING + columnIndex * (CARD_WIDTH + HORIZONTAL_GAP + 50),
          y: CANVAS_PADDING + rowIndex * (CARD_HEIGHT + VERTICAL_GAP * 0.75),
        };
      });
    });
    return positions;
  }

  const columnCount = Math.max(1, Math.ceil(Math.sqrt(Math.max(tables.length, 1))));
  tables.forEach((table, index) => {
    const columnIndex = index % columnCount;
    const rowIndex = Math.floor(index / columnCount);
    positions[table.id] = {
      x: CANVAS_PADDING + columnIndex * (CARD_WIDTH + HORIZONTAL_GAP),
      y: CANVAS_PADDING + rowIndex * (CARD_HEIGHT + VERTICAL_GAP),
    };
  });
  return positions;
}

export function DatabaseRelationshipDialog({
  open,
  onOpenChange,
  graph,
  loading,
  onRefresh,
}: DatabaseRelationshipDialogProps) {
  const [query, setQuery] = useState("");
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  const [layoutMode, setLayoutMode] = useState<LayoutMode>("relationship");
  const [manualPositions, setManualPositions] = useState<Record<string, { x: number; y: number }>>({});
  const [draggingTableId, setDraggingTableId] = useState<string | null>(null);
  const dragStateRef = useRef<{
    tableId: string;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);

  const filteredTables = useMemo(() => {
    const tables = graph?.tables || [];
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      return tables;
    }
    return tables.filter((table) => {
      const tableText = `${table.display_name || table.name} ${table.schema || ""}`.toLowerCase();
      const columnText = (table.columns || []).map((column) => column.name).join(" ").toLowerCase();
      return tableText.includes(normalizedQuery) || columnText.includes(normalizedQuery);
    });
  }, [graph?.tables, query]);

  const filteredTableIds = useMemo(
    () => new Set(filteredTables.map((table) => table.id)),
    [filteredTables]
  );

  const visibleRelationships = useMemo(() => {
    return (graph?.relationships || []).filter(
      (relationship) =>
        filteredTableIds.has(relationship.source_table_id) &&
        filteredTableIds.has(relationship.target_table_id)
    );
  }, [filteredTableIds, graph?.relationships]);

  const baseTablePositions = useMemo(
    () => buildBaseTablePositions(filteredTables, visibleRelationships, layoutMode),
    [filteredTables, layoutMode, visibleRelationships]
  );

  useEffect(() => {
    setManualPositions({});
  }, [layoutMode, graph?.source_label]);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      if (!dragStateRef.current) {
        return;
      }
      const { tableId, startX, startY, originX, originY } = dragStateRef.current;
      const nextX = Math.max(CANVAS_PADDING, originX + (event.clientX - startX));
      const nextY = Math.max(CANVAS_PADDING, originY + (event.clientY - startY));
      setManualPositions((prev) => ({
        ...prev,
        [tableId]: { x: nextX, y: nextY },
      }));
    };

    const handlePointerUp = () => {
      dragStateRef.current = null;
      setDraggingTableId(null);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, []);

  const tablePositions = useMemo(() => {
    const positions: Record<string, { x: number; y: number }> = { ...baseTablePositions };
    filteredTables.forEach((table) => {
      if (manualPositions[table.id]) {
        positions[table.id] = manualPositions[table.id];
      }
    });
    return positions;
  }, [baseTablePositions, filteredTables, manualPositions]);

  const canvasSize = useMemo(() => {
    const maxX = Math.max(
      CARD_WIDTH + CANVAS_PADDING * 2,
      ...Object.values(tablePositions).map((position) => position.x + CARD_WIDTH + CANVAS_PADDING)
    );
    const maxY = Math.max(
      CARD_HEIGHT + CANVAS_PADDING * 2,
      ...Object.values(tablePositions).map((position) => position.y + CARD_HEIGHT + CANVAS_PADDING)
    );
    return { width: maxX, height: maxY };
  }, [tablePositions]);

  const tableNameMap = useMemo(() => {
    const lookup: Record<string, string> = {};
    (graph?.tables || []).forEach((table) => {
      lookup[table.id] = table.display_name || table.name;
    });
    return lookup;
  }, [graph?.tables]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="dialog-page-like max-w-none w-auto h-auto p-0 overflow-hidden flex flex-col">
        <DialogHeader className="px-6 py-4 border-b bg-white dark:bg-gray-950">
          <div className="flex items-start justify-between gap-4">
            <div>
              <DialogTitle className="flex items-center gap-2">
                <GitBranch className="h-5 w-5 text-cyan-600" />
                数据脉络
              </DialogTitle>
              <DialogDescription className="mt-1">
                基于外键关系生成可拖拽的数据脉络视图，可切换多种布局方案，方便观察实体主从、连接路径和异常孤岛表。
              </DialogDescription>
            </div>
            <Button variant="outline" size="sm" onClick={onRefresh} disabled={loading}>
              {loading ? <RefreshCw className="mr-2 h-3.5 w-3.5 animate-spin" /> : null}
              刷新数据脉络
            </Button>
          </div>
        </DialogHeader>

        <div className="grid grid-cols-[1fr_340px] flex-1 min-h-0 bg-slate-50 dark:bg-black">
          <div className="min-w-0 min-h-0 flex flex-col">
            <div className="px-5 py-3 border-b border-gray-200 dark:border-gray-800 bg-white/90 dark:bg-gray-950/90 flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-3 text-xs text-gray-600 dark:text-gray-300 flex-wrap">
                <span className="inline-flex items-center gap-1 rounded-full border px-2 py-1 bg-white dark:bg-gray-900">
                  <Database className="h-3.5 w-3.5 text-cyan-600" />
                  {graph?.source_label || "未加载数据库"}
                </span>
                <span>表 {filteredTables.length}/{graph?.tables?.length || 0}</span>
                <span>关系 {visibleRelationships.length}/{graph?.relationships?.length || 0}</span>
                <span className="text-slate-400">拖动卡片可手工重排</span>
              </div>
              <div className="flex items-center gap-3 flex-wrap justify-end">
                <div className="flex items-center gap-2 rounded-md border border-slate-200 dark:border-slate-800 p-1 bg-white dark:bg-gray-950">
                  {LAYOUT_MODES.map((mode) => (
                    <Button
                      key={mode.id}
                      variant={layoutMode === mode.id ? "default" : "ghost"}
                      size="sm"
                      onClick={() => setLayoutMode(mode.id)}
                      className="h-8 text-xs"
                    >
                      {mode.label}
                    </Button>
                  ))}
                </div>
                <Button variant="outline" size="sm" onClick={() => setManualPositions({})}>
                  重置拖拽
                </Button>
                <div className="relative w-[320px]">
                  <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-gray-400" />
                  <Input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="搜索表名或字段"
                    className="h-9 pl-8 text-xs bg-white dark:bg-gray-950"
                  />
                </div>
              </div>
            </div>

            <div className="flex-1 min-h-0 overflow-auto p-4">
              {loading ? (
                <div className="h-full flex items-center justify-center text-sm text-gray-500">
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  正在读取数据脉络...
                </div>
              ) : !graph ? (
                <div className="h-full flex flex-col items-center justify-center gap-3 text-sm text-gray-500">
                  <GitBranch className="h-8 w-8 text-cyan-500" />
                  <div>尚未加载数据脉络，请点击“刷新数据脉络”。</div>
                </div>
              ) : filteredTables.length === 0 ? (
                <div className="h-full flex items-center justify-center text-sm text-gray-500">未找到匹配的表或字段。</div>
              ) : (
                <div
                  className="relative rounded-lg border border-cyan-100 dark:border-cyan-950 bg-[radial-gradient(circle_at_1px_1px,rgba(14,165,233,0.18)_1px,transparent_0)] [background-size:22px_22px]"
                  style={{ width: canvasSize.width, height: canvasSize.height }}
                >
                  <svg className="absolute inset-0 pointer-events-none" width={canvasSize.width} height={canvasSize.height}>
                    <defs>
                      <marker id="schema-arrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto" markerUnits="strokeWidth">
                        <path d="M0,0 L0,6 L9,3 z" fill="#0891b2" />
                      </marker>
                    </defs>
                    {visibleRelationships.map((relationship) => {
                      const sourcePosition = tablePositions[relationship.source_table_id];
                      const targetPosition = tablePositions[relationship.target_table_id];
                      if (!sourcePosition || !targetPosition) {
                        return null;
                      }
                      const sourceX = sourcePosition.x + CARD_WIDTH;
                      const sourceY = sourcePosition.y + CARD_HEIGHT / 2;
                      const targetX = targetPosition.x;
                      const targetY = targetPosition.y + CARD_HEIGHT / 2;
                      const controlOffset = Math.max(80, Math.abs(targetX - sourceX) / 2);
                      const path = `M ${sourceX} ${sourceY} C ${sourceX + controlOffset} ${sourceY}, ${targetX - controlOffset} ${targetY}, ${targetX} ${targetY}`;
                      const highlighted = selectedTableId === relationship.source_table_id || selectedTableId === relationship.target_table_id;
                      return (
                        <path
                          key={relationship.id}
                          d={path}
                          fill="none"
                          stroke={highlighted ? "#f59e0b" : "#0891b2"}
                          strokeWidth={highlighted ? 2.6 : 1.6}
                          strokeOpacity={highlighted ? 0.95 : 0.55}
                          markerEnd="url(#schema-arrow)"
                        />
                      );
                    })}
                  </svg>

                  {filteredTables.map((table) => {
                    const position = tablePositions[table.id];
                    const primaryKeys = (table.columns || []).filter((column) => column.is_pk);
                    const highlighted = selectedTableId === table.id;
                    const dragging = draggingTableId === table.id;
                    return (
                      <button
                        key={table.id}
                        type="button"
                        onClick={() => setSelectedTableId((current) => (current === table.id ? null : table.id))}
                        onPointerDown={(event) => {
                          if (event.button !== 0) {
                            return;
                          }
                          dragStateRef.current = {
                            tableId: table.id,
                            startX: event.clientX,
                            startY: event.clientY,
                            originX: position.x,
                            originY: position.y,
                          };
                          setDraggingTableId(table.id);
                        }}
                        className={`absolute text-left rounded-lg border bg-white dark:bg-gray-950 shadow-sm transition-all overflow-hidden ${
                          highlighted
                            ? "border-amber-400 shadow-amber-200/70 dark:shadow-amber-950/60"
                            : "border-gray-200 dark:border-gray-800 hover:border-cyan-300 dark:hover:border-cyan-800"
                        } ${dragging ? "cursor-grabbing" : "cursor-grab"}`}
                        style={{ width: CARD_WIDTH, height: CARD_HEIGHT, left: position.x, top: position.y, touchAction: "none" }}
                      >
                        <div className="px-3 py-2 border-b border-gray-100 dark:border-gray-800 bg-slate-900 text-white">
                          <div className="flex items-center justify-between gap-2">
                            <div className="text-sm font-medium truncate">{table.display_name || table.name}</div>
                            <Grip className="h-3.5 w-3.5 shrink-0 text-cyan-200/80" />
                          </div>
                          <div className="text-[10px] text-cyan-200 mt-0.5 truncate">
                            {table.schema || "default"} | rows: {table.row_count ?? "unknown"} | {layoutMode === "relationship" ? "关系优先" : layoutMode === "schema" ? "Schema" : "网格"}
                          </div>
                        </div>
                        <div className="p-3 space-y-1.5">
                          {(table.columns || []).slice(0, 6).map((column) => (
                            <div key={column.name} className="flex items-center gap-2 text-[11px] text-gray-700 dark:text-gray-300 min-w-0">
                              {column.is_pk ? <KeyRound className="h-3 w-3 text-amber-500 shrink-0" /> : <span className="h-3 w-3 rounded-full border border-cyan-300 shrink-0" />}
                              <span className="font-medium truncate">{column.name}</span>
                              <span className="text-gray-400 truncate">{column.type}</span>
                            </div>
                          ))}
                          {(table.columns || []).length > 6 ? (
                            <div className="text-[10px] text-gray-400 pt-1">+ {(table.columns || []).length - 6} fields</div>
                          ) : null}
                          {primaryKeys.length === 0 ? (
                            <div className="text-[10px] text-amber-600 pt-1">未识别主键</div>
                          ) : null}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <aside className="min-h-0 border-l border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 flex flex-col">
            <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-800">
              <div className="text-sm font-medium flex items-center gap-2">
                <Link2 className="h-4 w-4 text-cyan-600" />
                数据脉络关系
              </div>
              <div className="text-xs text-gray-500 mt-1">点击表节点可高亮连线，拖动卡片可手工重构视角。</div>
            </div>
            <div className="flex-1 min-h-0 overflow-auto p-3 space-y-2">
              {visibleRelationships.length === 0 ? (
                <div className="text-xs text-gray-500 leading-5">
                  当前范围内没有检测到外键关系。可检查数据库是否声明了外键，或在 SQL/数据字典中补充关系约束。
                </div>
              ) : (
                visibleRelationships.map((relationship) => (
                  <button
                    key={relationship.id}
                    type="button"
                    onClick={() => setSelectedTableId(relationship.source_table_id)}
                    className="w-full text-left rounded-md border border-gray-200 dark:border-gray-800 p-3 hover:border-cyan-300 dark:hover:border-cyan-800"
                  >
                    <div className="text-xs font-medium text-gray-800 dark:text-gray-100 truncate">{relationship.name}</div>
                    <div className="text-[11px] text-gray-500 dark:text-gray-400 mt-1 leading-5 break-words">
                      <span>{tableNameMap[relationship.source_table_id] || relationship.source_table_id}</span>
                      <span> ({relationship.source_columns.join(", ") || "-"})</span>
                      <span> -&gt; </span>
                      <span>{tableNameMap[relationship.target_table_id] || relationship.target_table_id}</span>
                      <span> ({relationship.target_columns.join(", ") || "-"})</span>
                    </div>
                  </button>
                ))
              )}
            </div>
          </aside>
        </div>
      </DialogContent>
    </Dialog>
  );
}
