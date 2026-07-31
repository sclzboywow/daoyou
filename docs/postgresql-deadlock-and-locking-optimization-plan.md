# PostgreSQL 死锁与锁优化方案

## 目标

解决生产环境偶发的 PostgreSQL 死锁、连接池耗尽和全站请求卡住问题。修复范围只覆盖锁、事务边界和必要的可观测性，不借机扩展业务模型。

## 已确认的主要风险

### 事务内重新申请数据库连接

服务进入事务后，如果下层 Repository 或 Service 忽略传入的 `DbTransaction`，再次通过全局 executor 发起查询，就会额外占用连接。并发请求较多时，外层事务占住连接等待内层查询，而内层查询又在等待连接池，最终形成连接池自锁。

处理原则：

- 写链路显式传递 `DbTransaction` / `DbExecutor`。
- 事务内禁止重新获取全局 executor。
- 查询、校验和写入尽量复用同一个事务 executor。

### 在数据库事务中等待外部系统

LLM、Redis、世界广播等外部调用耗时不可控。如果在事务内执行，会延长行锁和连接占用时间。

处理原则：

- LLM 推演、Redis 读取等放在事务开始前。
- 数据库事务只执行必要的条件校验和写入。
- Redis 缓存、广播等副作用在提交后执行。
- 提交后的副作用失败不回滚已经完成的数据库事务。

### 多资源写入顺序不稳定

拍卖、赌战、好友等涉及多个玩家或多条记录时，如果并发事务按不同顺序获取锁，容易形成 PostgreSQL 死锁。

处理原则：

- 多个 ID 在进入数据库写入前排序。
- Repository 按稳定顺序读取和更新。
- 资源扣减使用带余额或版本条件的原子更新。
- 对 PostgreSQL `40P01`、`40001`、`55P03` 做有限次数、短退避重试。

## Redis 与 PostgreSQL 的职责边界

PostgreSQL 保存不可丢失、需要审计或必须参与原子交易的最终状态，例如角色、库存、货币、拍卖成交和战斗结算。

Redis 保存可重建、带 TTL 或只用于并发协调的状态，例如：

- 排行榜及每日挑战次数
- 造物待确认结果
- 命格重塑临时会话
- 坊市本轮个人购买标记
- 分布式锁
- 周期缓存与冷却状态

本次明确不新增以下 PostgreSQL 持久化：

- 排行榜状态表和挑战次数表
- 排行奖励快照、明细和结算表
- 临时玩家操作会话表
- 坊市购买账本

Redis 临时数据过期或丢失时，接受对应临时流程重置；不为此引入双写、回填或补偿框架。

## 保留的修复

- PostgreSQL 连接池连接、空闲、语句、锁和空闲事务超时。
- 连接池等待数与慢事务、失败事务日志。
- 统一 Redis 锁实现、稳定多 key 排序、租约续期和租约失效检查。
- 玩家状态写入的事务 executor 传播。
- Qi、拍卖、赌战、炼丹、造物、地下城等写链路的条件更新和稳定锁顺序。
- LLM、Redis 与广播移出数据库事务。
- 活跃角色唯一约束，防止同一用户出现多个活跃角色。

## 不采用的扩展

- 不为了幂等或临时状态新增业务账本。
- 不把 Redis 数据复制到 PostgreSQL 作为“权威备份”。
- 不给只读接口统一套玩家级分布式锁。
- 不增加读取时自动恢复、跨存储双写修复和多阶段补偿流程。
- 不为无法稳定复现的外部并发时序堆叠架构测试。

## 生产验证

发布后重点观察：

- PostgreSQL `deadlock detected`、`lock timeout`、`statement timeout`
- pool waiting 是否持续大于 0
- 慢事务持续时间、重试次数和 PostgreSQL 错误码
- Redis 锁竞争、续期失败和租约丢失
- 请求 409、429、503 的变化

若再次发生卡死，应优先收集：

```sql
select
  pid,
  usename,
  application_name,
  state,
  wait_event_type,
  wait_event,
  xact_start,
  query_start,
  pg_blocking_pids(pid) as blocking_pids,
  query
from pg_stat_activity
where datname = current_database()
order by xact_start nulls last, query_start;
```

同时保存 PostgreSQL deadlock 日志中的完整 wait graph，用具体 SQL 和调用链定位剩余的锁顺序问题。
