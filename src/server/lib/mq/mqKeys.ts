/**
 * BullMQ 使用的全部固定标识集中定义在这里。
 *
 * 新增队列或作业时必须先在本文件登记，业务模块不得自行硬编码名称，
 * 便于统一检索、避免命名冲突，并为后续监控与运维工具提供稳定入口。
 */
export const MQ_KEYS = {
  /** BullMQ Redis 键前缀；显式固定为默认值，后续调整时可统一迁移。 */
  redisPrefix: 'bull',
  /** 队列名称：会成为 BullMQ 在 Redis 中生成键的核心组成部分。 */
  queues: {
    /** 宗门设施建设进度异步结算队列。 */
    sectFacilityConstruction: 'sect-facility-construction',
    /** 通用任务进度异步结算队列。 */
    taskProgress: 'task-progress',
    /** 后台群发、补发与活动投递队列。 */
    adminBatch: 'admin-batch',
  },
  /** 作业名称：用于区分同一队列中的不同消息处理类型。 */
  jobs: {
    /** 将一条已完成玩家结算的建设事件应用到宗门设施。 */
    applySectFacilityConstruction: 'apply-construction',
    /** 将一条玩家行为事件应用到任务进度。 */
    applyTaskProgress: 'apply-task-progress',
    /** 执行一条持久化后台批处理任务。 */
    processAdminBatch: 'process-admin-batch',
  },
  /** 本地事务消息类型：作为数据库消息与 MQ 路由之间的稳定标识。 */
  messages: {
    /** 宗门设施建设进度结算消息。 */
    sectFacilityConstruction: 'sect.facility-construction.apply',
    /** 玩家任务进度结算消息。 */
    taskProgress: 'task.progress.apply',
  },
} as const;

/**
 * jobId 使用持久事件 UUID 动态生成，不属于固定 Key，因此不在此枚举。
 * 同一事件 UUID 同时承担 BullMQ 去重键与数据库幂等标识。
 */

export type MqQueueKey = (typeof MQ_KEYS.queues)[keyof typeof MQ_KEYS.queues];
export type MqJobKey = (typeof MQ_KEYS.jobs)[keyof typeof MQ_KEYS.jobs];
export type LocalTransactionMessageKey =
  (typeof MQ_KEYS.messages)[keyof typeof MQ_KEYS.messages];
