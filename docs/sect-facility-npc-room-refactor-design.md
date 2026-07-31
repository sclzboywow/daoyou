# 宗门设施房间与 NPC 会话设计

## 状态与边界

- 宗门设施使用 `RoomView`、`NpcConversation` 和 `useConversationSession` 组成房间、对话与会话生命周期。
- 通用层不读取宗门数据、不解析路由，也不判断任务或工作区；它只按 NPC 的 `appearance` 选择人物或设施展示。
- 宗门业务层通过 renderer registry 组合不同会话；复杂玩法仍在独立工作区中完成。
- 不建立服务端会话或持久聊天记录，权威状态继续由现有查询资源持有。

## 组件职责

- `RoomView` 只展示房间描述、NPC、选中状态和详情区域；人物与设施始终混排在同一份 `actors` 网格中，由头像、身份和职责帮助玩家分辨。
- `NpcConversation` 只展示 NPC 信息、消息、单句回应、忙碌和错误状态；设施型 NPC 使用 Emoji 且不添加人物发言引号。
- `useConversationSession` 负责加载、并发禁用、过期响应丢弃和一次性结果：
  - `onReset` 在新会话开始时清理局部状态。
  - `onDispose` 在旧会话结束时释放临时资源。
- `SectManagedRoom` 接受可选的受控 `selection`；未传入时使用内部选中状态。
- `SectRoutedRoom` 是宗门业务适配器，以 `npc=<roleKey>` 将房间选中状态映射到当前 URL。
- `SectNpcConversationRegistry` 在页面组合时校验整个房间所需的 renderer，避免玩家点击人物后才发现缺失注册。

## 返回与刷新协议

- `npc` 保存稳定的角色语义键，不保存姓名或内部 NPC ID。
- 任一 NPC 切换使用 history replace；无效角色键按未选中处理。
- 进入工作区时保留 `npc`，退出时移除 `workspace` 并恢复原 NPC。
- 炼丹、炼器和闭关恢复 `keeper`，神通工作区恢复 `instructor`。
- 矿场战斗恢复 `keeper`，宗门小比恢复 `marshal`，山门清扫与灵矿采掘恢复各自房间的 `facility`。
- 返回后重新挂载人物会话并刷新其负责的权威资源；失败不重放写请求。
- 返回地址由宗门页面和活动地点配置生成，通用房间、对话和会话管理器不理解任何路由。

## NPC 内容规范

- 字形、身份、职责、role key 和 renderer 由标准房间定义固定。
- `appearance` 只允许 `person` 与 `facility`；设施仍是完整 NPC，不建立第二套定义、registry 或 URL 参数。
- 四个生产宗门必须显式覆盖已开放 NPC 的 ID、姓名和问候；设施型 NPC 的姓名使用该宗门的设施名。
- 人物姓名用于塑造角色，身份栏用于解释工作；人物禁止用设施或职位关键词直接拼成姓名。设施型 NPC 使用 Emoji 字形、`宗门设施` 身份与环境叙述。
- 事务堂标准任务与设施操作术语保持统一，不因宗门主题改名。
- 问候应以一句自然话说明当前可办理的事，不解释姓名，不重复身份栏，也不输出内部 renderer、metric、设施或任务键。

## 扩展方式

新增房间时，先在 shared 标准目录定义角色语义、`appearance` 与 renderer，再由各生产宗门提供 NPC 姓名和问候，最后在对应页面 registry 注册业务会话。新增设施功能仍按 NPC renderer 扩展；新增工作区或活动返回路径时，只扩展宗门业务路由适配器，不得让通用房间组件判断具体宗门、设施键、任务或路由。

## 灵脉采掘

- 灵脉房间仍只有一份人物与设施混排的 `actors` 网格。
- 守脉执事的 renderer 只负责矿场巡视任务；灵脉设施型 NPC 的 renderer 展示设施等级、周俸灵石加成与采掘状态。
- 有 active `spirit_mining` 时，设施选项开启奖励场次；未领取、已结清或不可用时进入无奖励自由练习。
- 活动退出统一返回 `/game/sect/spirit-vein?npc=facility`。达标后任务转为待领奖，玩家再由事务堂完成结算。
