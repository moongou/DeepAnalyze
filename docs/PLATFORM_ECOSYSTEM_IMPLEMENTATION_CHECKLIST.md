# Platform & Ecosystem Implementation Checklist

本清单用于持续回查“平台化 + 生态化”方案是否真正落地，并作为后续每次迭代的验收基线。

## A. 统一对象模型

- [x] Skill Manifest 扩展目录字段（directory/compatibility/install_commands/requires/benchmark/security_scan）
- [x] Skill install/run 返回结构支持策略追踪字段（policy_decision_id/policy_effect）
- [ ] Workflow 对象加入 plan snapshot hash 与 diff 信息
- [ ] 发布对象（release gate）标准化

## B. 策略前置（Policy First）

- [x] install 前策略预检查（/v1/marketplace/policies/check-install）
- [x] run 前策略预检查（/v1/marketplace/policies/check-run）
- [x] install/run 主路径强制策略前置
- [ ] 策略规则支持外部化（policy-as-code）
- [x] 细粒度资源权限 scope v1（install 支持 permission_scopes，run 前按 scope 校验）
- [x] 细粒度资源权限完整形态（action + resource + scope + ttl）

## C. 证据闭环（Audit Trail）

- [x] 策略决策持久记录（SQLite lifecycle）
- [x] 策略决策审计查询（/v1/marketplace/policies/decisions）
- [x] 单条策略决策查询（/v1/marketplace/policies/decisions/{decision_id}）
- [x] skill_runs/policy_decisions 迁移到持久化数据库
- [x] trace_id 全链路注入（install -> run -> workflow）

## D. 用户确认式分析流程

- [x] plan -> confirm -> execute 基础链路
- [x] custom-skill 执行写回 run_id
- [x] 二次确认（高成本/外发/写操作）
- [x] 分步恢复执行（resume from checkpoint）
- [ ] plan 快照 diff 展示

## E. 市场生态能力

- [x] 目录化技能列表与筛选
- [x] 一键加载技能
- [x] 文档/数据分析推荐技能目录（含 xParse）
- [ ] 可信度评分与排序（Trust/Success/Freshness/Compatibility）
- [ ] 安全扫描状态自动同步（Security Scan）

## F. 评测与治理闭环

- [x] 离线评测基线（准确率/时延/成本/稳定性）
- [x] 在线观测指标（成功率/P95/拒绝率/重试率）
- [x] 发布门禁（小流量 + 回滚）
- [ ] 治理看板（技能/发布者/目录/租户）

## 当前实现说明（基线）

- 当前已经实现：对象扩展、策略前置 v1、策略审计查询、权限 scope v1、marketplace 目录化与一键加载、SQLite 审计持久化、trace_id 全链路。
- 当前尚未实现：策略外部化、治理看板全量能力。

## 快速验收命令

```bash
curl "http://localhost:8200/v1/marketplace/policies/decisions"
curl -X POST "http://localhost:8200/v1/marketplace/policies/check-install" -H "Content-Type: application/json" -d '{"skill_id":"intsig-textin-xparse-parser","config":{}}'
curl -X POST "http://localhost:8200/v1/marketplace/policies/check-run" -H "Content-Type: application/json" -d '{"skill_id":"intsig-textin-xparse-parser","context":{}}'
```
