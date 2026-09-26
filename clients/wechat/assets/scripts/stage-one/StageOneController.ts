import { HorizontalTextAlignment, Node } from 'cc';
import { authFlow, type AuthFlowState } from '../app/AuthFlow';
import { gameStateStore } from '../game/GameStateStore';
import { INK_HEIGHT, InkColors, InkUi } from '../ui/InkUi';
import { PerformanceRunner, type PerformanceFrame } from './PerformanceRunner';
import { stageOneApi } from './StageOneApi';
import type {
  Attributes,
  BagItem,
  BagView,
  GenerationDraft,
  GenerationQuota,
  MailView,
  PerformanceScript,
  PlayerDetails,
  StoryView,
  TaskView,
} from './StageOneTypes';

type MainTab = 'home' | 'character' | 'inventory' | 'tasks' | 'mail';

const ATTRIBUTE_LABELS: Array<[keyof Attributes, string]> = [
  ['vitality', '体魄'],
  ['strength', '力道'],
  ['spirit', '灵力'],
  ['endurance', '根骨'],
  ['speed', '身法'],
  ['willpower', '神识'],
];

export class StageOneController {
  private readonly ui: InkUi;
  private userName = '';
  private tab: MainTab = 'home';
  private player: PlayerDetails | null = null;
  private unsubscribeState: (() => void) | null = null;
  private generationQuota: GenerationQuota | null = null;
  private draft: GenerationDraft | null = null;
  private selectedFates = new Set<number>();
  private inventory: BagView | null = null;
  private inventoryPage = 0;
  private tasks: { active: TaskView[]; completed: TaskView[] } | null = null;
  private taskPage = 0;
  private mails: MailView[] = [];
  private mailPage = 0;
  private story: StoryView | null = null;
  private storyLoading = false;
  private performanceRunner: PerformanceRunner | null = null;
  private performanceScript: PerformanceScript | null = null;
  private busy = false;
  private readonly safeTop: number;
  private readonly safeBottom: number;

  constructor(private readonly host: Node) {
    this.ui = new InkUi(host);
    const safe = this.readSafeArea();
    this.safeTop = safe.top;
    this.safeBottom = safe.bottom;
  }

  async start(): Promise<void> {
    this.renderLoading('正在连接云梦界…');
    const state = await authFlow.tryWechatSignIn();
    await this.routeAuthState(state);
  }

  destroy(): void {
    this.unsubscribeState?.();
    this.unsubscribeState = null;
    gameStateStore.disconnectRealtime();
    this.ui.destroy();
  }

  private async routeAuthState(state: AuthFlowState): Promise<void> {
    if (state.status === 'signed-in') {
      this.userName = state.name;
      await this.enterGame();
      return;
    }
    if (state.status === 'unlinked') {
      this.renderUnlinked();
      return;
    }
    this.renderError(state.message);
  }

  private async enterGame(): Promise<void> {
    this.renderLoading('正在读取道身…');
    try {
      this.player = await stageOneApi.loadPlayerDetails();
      if (!this.player.cultivatorId) {
        await this.prepareCreation();
        return;
      }
      await gameStateStore.refresh();
      if (!this.unsubscribeState) {
        this.unsubscribeState = gameStateStore.subscribe(() => {
          void this.refreshPlayer(false).then(() => {
            if (this.tab === 'inventory') {
              this.inventory = null;
              void this.renderInventory();
              return;
            }
            if (this.tab === 'tasks') {
              this.tasks = null;
              void this.renderTasks();
              return;
            }
            if (this.tab === 'mail') {
              this.mails = [];
              this.mailPage = 0;
              void this.renderMail();
              return;
            }
            this.renderTab();
          });
        });
      }
      gameStateStore.connectRealtime();
      await this.loadStory(false);
      this.renderTab();
    } catch (error) {
      this.renderError(this.message(error, '读取游戏状态失败'));
    }
  }

  private async refreshPlayer(render = true): Promise<void> {
    try {
      this.player = await stageOneApi.loadPlayerDetails();
      if (render) this.renderTab();
    } catch (error) {
      if (render) this.ui.toast(this.message(error, '刷新失败'), 'danger');
    }
  }

  private renderLoading(message: string): void {
    const root = this.ui.reset('Loading');
    this.ui.title(root, '万界道友 · 云梦界', 430);
    this.ui.text(root, message, 0, 290, 28, InkColors.muted, 620);
  }

  private renderError(message: string): void {
    const root = this.ui.reset('Error');
    this.ui.title(root, '连接失败', 430);
    this.ui.text(root, message, 0, 290, 24, InkColors.danger, 620, 180);
    this.ui.button(root, '重新尝试', 0, 100, 300, async () => {
      this.renderLoading('正在重新连接…');
      await this.routeAuthState(await authFlow.tryWechatSignIn());
    });
  }

  private renderUnlinked(): void {
    const root = this.ui.reset('Unlinked');
    this.ui.title(root, '初入云梦', 445);
    this.ui.text(
      root,
      '当前微信尚未绑定云梦界账号。已有 Web 角色请选择“已有账号”，避免生成第二个角色。',
      0,
      310,
      25,
      InkColors.ink,
      620,
      150,
    );
    this.ui.button(root, '已有云梦界账号', 0, 95, 430, () => this.renderExistingAccount());
    this.ui.button(root, '我是新玩家', 0, -25, 430, () => this.renderNewAccount());
    this.ui.text(root, '绑定后 Web 与微信使用同一个 userId 与同一角色数据。', 0, -190, 21, InkColors.muted, 620);
  }

  private renderExistingAccount(): void {
    const root = this.ui.reset('BindExisting');
    this.ui.title(root, '绑定已有账号', 475);
    this.ui.text(root, '使用 Web 端邮箱验证码登录，再把当前微信身份绑定到原账号。', 0, 365, 23, InkColors.muted, 620, 100);
    const email = this.ui.input(root, 'Web 账号邮箱', 0, 220, 560, 72, 100);
    const otp = this.ui.input(root, '6 位邮箱验证码', 0, 105, 560, 72, 12);
    const status = this.ui.text(root, '', 0, 10, 20, InkColors.muted, 620, 60);
    this.ui.button(root, '发送验证码', -160, -115, 260, async () => {
      if (!email.string.trim()) return void (status.string = '请先填写邮箱');
      status.string = '正在发送验证码…';
      try {
        await authFlow.sendExistingAccountOtp(email.string.trim());
        status.string = '验证码已发送';
      } catch (error) {
        status.string = this.message(error, '验证码发送失败');
      }
    });
    this.ui.button(root, '登录并绑定', 160, -115, 260, async () => {
      if (!email.string.trim() || !otp.string.trim()) {
        status.string = '请填写邮箱与验证码';
        return;
      }
      status.string = '正在验证并绑定…';
      try {
        await authFlow.signInExistingAccount({ email: email.string.trim(), otp: otp.string.trim() });
        await authFlow.bindCurrentWechatIdentity();
        await this.routeAuthState(await authFlow.tryWechatSignIn());
      } catch (error) {
        status.string = this.message(error, '绑定失败');
      }
    });
    this.ui.button(root, '返回', 0, -280, 220, () => this.renderUnlinked(), { secondary: true });
  }

  private renderNewAccount(): void {
    const root = this.ui.reset('NewAccount');
    this.ui.title(root, '创建云梦界账号', 470);
    this.ui.text(root, '仅确认没有既有 Web 账号时使用。创建后将直接进入“凝聚道生”。', 0, 350, 23, InkColors.warning, 620, 100);
    const name = this.ui.input(root, '账号昵称', 0, 190, 520, 72, 32);
    const status = this.ui.text(root, '', 0, 70, 20, InkColors.muted, 620, 60);
    this.ui.button(root, '确认创建', 0, -60, 360, async () => {
      if (!name.string.trim()) return void (status.string = '请填写昵称');
      const state = await authFlow.registerNewWechatUser(name.string.trim());
      if (state.status === 'signed-in') await this.routeAuthState(state);
      else status.string = state.status === 'error' ? state.message : '创建失败';
    });
    this.ui.button(root, '返回', 0, -220, 220, () => this.renderUnlinked(), { secondary: true });
  }

  private async prepareCreation(): Promise<void> {
    this.renderLoading('正在查阅今日推演次数…');
    try {
      this.generationQuota = await stageOneApi.generationQuota();
    } catch {
      this.generationQuota = null;
    }
    this.renderCreationPrompt();
  }

  private renderCreationPrompt(): void {
    const root = this.ui.reset('CreateCultivator');
    this.ui.title(root, '凝聚道生', 500);
    this.ui.text(root, '以一段心念描述你想成为怎样的修士。角色生成仍由现有服务端规则与 AI 流程完成。', 0, 390, 23, InkColors.muted, 630, 110);
    const prompt = this.ui.input(root, '例：一位靠炼丹逆袭的落魄少主……', 0, 200, 620, 180, 200, true);
    const quota = this.generationQuota;
    this.ui.text(
      root,
      quota ? `今日剩余 ${quota.remaining}/${quota.dailyLimit} 次` : '推演次数暂未读取',
      0,
      75,
      20,
      quota?.remaining === 0 ? InkColors.danger : InkColors.muted,
      620,
    );
    const status = this.ui.text(root, '', 0, -20, 20, InkColors.muted, 620, 60);
    this.ui.button(root, '凝气成形', 0, -135, 380, async () => {
      const text = prompt.string.trim();
      if (Array.from(text).length < 2) return void (status.string = '至少输入 2 个字');
      if (Array.from(text).length > 200) return void (status.string = '最多 200 个字');
      if (quota?.remaining === 0) return void (status.string = '今日推演次数已用尽');
      if (this.busy) return;
      this.busy = true;
      this.renderLoading('灵气汇聚，正在推演真形与气运…');
      try {
        this.draft = await stageOneApi.generateCharacter(text);
        this.generationQuota = this.draft.quota;
        this.selectedFates.clear();
        this.renderCreationDraft();
      } catch (error) {
        this.renderCreationPrompt();
        this.ui.toast(this.message(error, '角色生成失败'), 'danger');
      } finally {
        this.busy = false;
      }
    }, { disabled: quota?.remaining === 0 });
  }

  private renderCreationDraft(): void {
    const draft = this.draft;
    if (!draft) return this.renderCreationPrompt();
    const root = this.ui.reset('CreationDraft');
    const c = draft.cultivator;
    this.ui.title(root, `${c.name} · ${c.realm}${c.realm_stage}`, 565);
    this.ui.text(root, `${c.origin ?? '散修'} · ${c.gender} · ${c.age}/${c.lifespan} 岁`, 0, 510, 21, InkColors.muted, 640);
    const roots = c.spiritual_roots.map((v) => `${v.element}${v.grade ? `·${v.grade}` : ''}`).join('｜');
    this.ui.text(root, `灵根：${roots || '未显'}`, 0, 462, 21, InkColors.ink, 640);
    this.ui.text(root, c.background ?? '', 0, 375, 19, InkColors.muted, 640, 105);
    this.ui.text(root, `先天气运 · 已选 ${this.selectedFates.size}/3`, 0, 305, 23, InkColors.ink, 640);

    draft.fates.slice(0, 6).forEach((fate, index) => {
      const selected = this.selectedFates.has(index);
      const row = Math.floor(index / 2);
      const col = index % 2;
      const x = col === 0 ? -170 : 170;
      const y = 220 - row * 110;
      this.ui.button(
        root,
        `${selected ? '✓ ' : ''}${fate.name}${fate.quality ? ` · ${fate.quality}` : ''}`,
        x,
        y,
        310,
        () => {
          if (selected) this.selectedFates.delete(index);
          else if (this.selectedFates.size < 3) this.selectedFates.add(index);
          else return this.ui.toast('最多选择 3 个先天气运', 'danger');
          this.renderCreationDraft();
        },
        { secondary: !selected, fontSize: 19, height: 78 },
      );
    });

    this.ui.button(root, `逆天改命 (${draft.remainingRerolls})`, -180, -165, 280, async () => {
      if (draft.remainingRerolls <= 0 || this.busy) return;
      this.busy = true;
      try {
        const next = await stageOneApi.generateFates(draft.tempCultivatorId);
        draft.fates = next.fates;
        draft.remainingRerolls = next.remainingRerolls;
        this.selectedFates.clear();
        this.renderCreationDraft();
      } catch (error) {
        this.ui.toast(this.message(error, '气运推演失败'), 'danger');
      } finally {
        this.busy = false;
      }
    }, { secondary: true, disabled: draft.remainingRerolls <= 0 });
    this.ui.button(root, '重新凝聚', 0, -165, 220, () => {
      this.draft = null;
      this.selectedFates.clear();
      this.renderCreationPrompt();
    }, { secondary: true });
    this.ui.button(root, '以此真身入世', 190, -165, 300, async () => {
      if (this.selectedFates.size !== 3) return this.ui.toast('请选择 3 个先天气运', 'danger');
      if (this.busy) return;
      this.busy = true;
      this.renderLoading('真形落地，玉简正在显字…');
      try {
        await stageOneApi.saveCharacter(draft.tempCultivatorId, [...this.selectedFates]);
        this.draft = null;
        this.selectedFates.clear();
        await this.enterGame();
        await this.openCurrentStory();
      } catch (error) {
        this.renderCreationDraft();
        this.ui.toast(this.message(error, '入世失败'), 'danger');
      } finally {
        this.busy = false;
      }
    });
  }

  private renderTab(): void {
    if (!this.player?.cultivatorId) return void this.renderCreationPrompt();
    if (this.tab === 'character') this.renderCharacter();
    else if (this.tab === 'inventory') void this.renderInventory();
    else if (this.tab === 'tasks') void this.renderTasks();
    else if (this.tab === 'mail') void this.renderMail();
    else this.renderHome();
  }

  private renderHeader(root: Node, title: string): void {
    this.ui.text(root, '万界道友 · 云梦界', -210, 585 - this.safeTop, 22, InkColors.muted, 300, 46, HorizontalTextAlignment.LEFT);
    this.ui.text(root, this.userName ? `账号：${this.userName}` : '', 210, 585 - this.safeTop, 18, InkColors.muted, 300, 46);
    this.ui.title(root, title, 515);
  }

  private renderNav(root: Node): void {
    const tabs: Array<[MainTab, string]> = [
      ['home', '洞府'],
      ['character', '角色'],
      ['inventory', '背包'],
      ['tasks', '任务'],
      ['mail', '玉简'],
    ];
    tabs.forEach(([tab, label], index) => {
      const x = -300 + index * 150;
      this.ui.button(root, label, x, -575 + this.safeBottom, 130, () => {
        this.tab = tab;
        this.renderTab();
      }, { secondary: this.tab !== tab, height: 62, fontSize: 20 });
    });
  }

  private renderHome(): void {
    const p = this.player;
    const root = this.ui.reset('Home');
    this.renderHeader(root, '洞府');
    if (!p?.profile) {
      this.ui.text(root, p?.note ?? '暂无活跃角色', 0, 250, 25, InkColors.muted, 620);
      return this.renderNav(root);
    }
    const c = p.profile;
    this.ui.text(root, `${c.title ? `「${c.title}」` : ''}${c.name}`, 0, 405, 36, InkColors.ink, 620);
    this.ui.text(root, `${c.realm} · ${c.realm_stage}　寿元 ${c.age}/${c.lifespan}`, 0, 350, 22, InkColors.muted, 620);
    this.stat(root, '天地灵气', String(p.currency?.qi ?? 0), -220, 235);
    this.stat(root, '灵石', this.number(p.currency?.spiritStones ?? 0), 0, 235);
    this.stat(root, '声望', this.number(p.currency?.reputation ?? 0), 220, 235);
    this.stat(root, '未读玉简', String(p.unreadMail), -220, 105);
    this.stat(root, '进行任务', String(p.activeTasks), 0, 105);
    this.stat(root, '可领奖励', String(p.claimableTasks), 220, 105);

    const story = this.story;
    this.ui.card(
      root,
      story ? `主线 · ${story.chapterTitle}` : '主线玉简',
      story?.prompt || '玉简暂时没有新字。',
      0,
      -75,
      650,
      125,
      story ? 'accent' : 'normal',
    );
    if (story) {
      this.ui.button(root, '继续主线', 0, -190, 280, () => void this.openCurrentStory());
    }
    this.ui.text(root, `服务器时间：${p.serverTime.replace('T', ' ').slice(0, 19)}`, 0, -305, 18, InkColors.muted, 650);
    this.renderNav(root);
  }

  private renderCharacter(): void {
    const p = this.player;
    const root = this.ui.reset('Character');
    this.renderHeader(root, '角色');
    const c = p?.profile;
    if (!c) {
      this.ui.text(root, '角色数据暂不可用', 0, 220, 24, InkColors.muted, 620);
      return this.renderNav(root);
    }
    this.ui.text(root, `${c.name} · ${c.realm}${c.realm_stage}`, 0, 425, 30, InkColors.ink, 620);
    const base = c.attributes;
    const effective = p?.condition?.combatV6?.effectiveAttributes ?? base;
    ATTRIBUTE_LABELS.forEach(([key, label], index) => {
      const row = Math.floor(index / 2);
      const col = index % 2;
      const x = col === 0 ? -170 : 170;
      const y = 315 - row * 86;
      const delta = (effective?.[key] ?? base[key]) - base[key];
      const value = delta === 0 ? `${base[key]}` : `${base[key]} ${delta > 0 ? '+' : ''}${delta} = ${effective?.[key] ?? base[key]}`;
      this.ui.card(root, label, value, x, y, 310, 72, delta === 0 ? 'normal' : 'accent');
    });
    const roots = c.spiritual_roots.map((r) => `${r.element}${r.grade ? `·${r.grade}` : ''}(${r.strength})`).join('｜');
    this.ui.text(root, `灵根：${roots}`, 0, 20, 19, InkColors.muted, 650, 70);
    this.ui.text(root, `修为 ${p?.progress?.cultivation_exp ?? 0}/${p?.progress?.exp_cap ?? 0}　感悟 ${p?.progress?.comprehension_insight ?? 0}`, 0, -45, 20, InkColors.ink, 650);
    const title = this.ui.input(root, c.title || '输入 2–8 字称号', -110, -145, 410, 62, 8);
    if (c.title) title.string = c.title;
    this.ui.button(root, '保存称号', 225, -145, 180, async () => {
      const value = title.string.trim();
      if (value && (Array.from(value).length < 2 || Array.from(value).length > 8)) return this.ui.toast('称号需 2–8 字', 'danger');
      try {
        await stageOneApi.updateTitle(value || null);
        await this.refreshPlayer(false);
        this.renderCharacter();
        this.ui.toast('称号已保存，Web 与微信共用同一角色', 'success');
      } catch (error) {
        this.ui.toast(this.message(error, '保存失败'), 'danger');
      }
    });
    this.renderNav(root);
  }

  private async renderInventory(): Promise<void> {
    const root = this.ui.reset('Inventory');
    this.renderHeader(root, '背包');
    this.ui.text(root, '新版背包不再提供手动拆分；丹药支持批量服用。', 0, 445, 19, InkColors.muted, 650);
    if (!this.inventory) {
      this.ui.text(root, '正在读取随身物品…', 0, 250, 24, InkColors.muted, 620);
      this.renderNav(root);
      try {
        this.inventory = await stageOneApi.loadBag();
        this.renderInventory();
      } catch (error) {
        this.ui.toast(this.message(error, '背包读取失败'), 'danger');
      }
      return;
    }
    const pageSize = 7;
    const start = this.inventoryPage * pageSize;
    const items = this.inventory.items.slice(start, start + pageSize);
    this.ui.text(root, `随身 ${this.inventory.used}/${this.inventory.capacity} 格`, 0, 395, 21, InkColors.ink, 620);
    items.forEach((item, index) => this.renderInventoryRow(root, item, 315 - index * 92));
    const totalPages = Math.max(1, Math.ceil(this.inventory.items.length / pageSize));
    this.ui.button(root, '上一页', -170, -390, 190, () => {
      this.inventoryPage = Math.max(0, this.inventoryPage - 1);
      this.renderInventory();
    }, { secondary: true, disabled: this.inventoryPage === 0 });
    this.ui.text(root, `${this.inventoryPage + 1}/${totalPages}`, 0, -390, 19, InkColors.muted, 120);
    this.ui.button(root, '下一页', 170, -390, 190, () => {
      this.inventoryPage = Math.min(totalPages - 1, this.inventoryPage + 1);
      this.renderInventory();
    }, { secondary: true, disabled: this.inventoryPage >= totalPages - 1 });
    this.renderNav(root);
  }

  private renderInventoryRow(root: Node, item: BagItem, y: number): void {
    const isConsumable = item.definitionId === 'consumable.v1';
    const facts = isConsumable && item.instanceData && typeof item.instanceData === 'object'
      ? (item.instanceData as { spec?: { kind?: string }; description?: string })
      : null;
    const isPill = facts?.spec?.kind === 'pill';
    this.ui.card(root, `${item.name}${item.quantity > 1 ? ` ×${item.quantity}` : ''}`, facts?.description ?? item.definitionId, -60, y, 510, 80);
    if (isConsumable) {
      this.ui.button(root, '用1', 245, y + 18, 120, () => void this.consumeItem(item, 1), { height: 42, fontSize: 18 });
      if (isPill && item.quantity > 1) {
        this.ui.button(root, '批量', 245, y - 27, 120, () => this.renderPillQuantity(item), { height: 38, fontSize: 17, secondary: true });
      }
    }
  }

  private renderPillQuantity(item: BagItem): void {
    const root = this.ui.reset('PillQuantity');
    this.renderHeader(root, '批量服丹');
    const max = Math.min(99, item.quantity);
    this.ui.text(root, item.name, 0, 330, 30, InkColors.ink, 620);
    this.ui.text(root, `持有 ${item.quantity} 颗 · 本次最多 ${max} 颗`, 0, 275, 20, InkColors.muted, 620);
    this.ui.text(root, '服务端会逐颗校验药效、丹毒与使用限制；任一条件不满足会返回失败。', 0, 205, 19, InkColors.muted, 620, 70);
    const quantity = this.ui.input(root, '输入 1–99', 0, 80, 430, 68, 2);
    quantity.string = String(Math.min(5, max));
    this.ui.button(root, '确认服用', -130, -70, 240, async () => {
      const count = Number.parseInt(quantity.string.trim(), 10);
      if (!Number.isInteger(count) || count < 1 || count > max) {
        this.ui.toast(`请输入 1–${max} 的整数`, 'danger');
        return;
      }
      await this.consumeItem(item, count);
    });
    this.ui.button(root, '返回背包', 150, -70, 220, () => this.renderInventory(), { secondary: true });
    this.renderNav(root);
  }

  private async consumeItem(item: BagItem, quantity: number): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      await stageOneApi.consume(item.id, item.revision, quantity);
      this.inventory = await stageOneApi.loadBag();
      await this.refreshPlayer(false);
      this.renderInventory();
      this.ui.toast(quantity > 1 ? `已批量服用 ${quantity} 颗` : '已使用', 'success');
    } catch (error) {
      this.inventory = null;
      this.renderInventory();
      this.ui.toast(this.message(error, '使用失败'), 'danger');
    } finally {
      this.busy = false;
    }
  }

  private async renderTasks(): Promise<void> {
    const root = this.ui.reset('Tasks');
    this.renderHeader(root, '任务');
    if (!this.tasks) {
      this.ui.text(root, '正在翻阅任务玉简…', 0, 250, 24, InkColors.muted, 620);
      this.renderNav(root);
      try {
        this.tasks = await stageOneApi.loadTasks();
        this.renderTasks();
      } catch (error) {
        this.ui.toast(this.message(error, '任务读取失败'), 'danger');
      }
      return;
    }
    const all = [...this.tasks.active, ...this.tasks.completed];
    const pageSize = 5;
    const start = this.taskPage * pageSize;
    all.slice(start, start + pageSize).forEach((task, index) => {
      const y = 355 - index * 145;
      const reward = task.metadata?.rewardSummary ?? task.snapshot.rewardSummary ?? [];
      const claimed = Boolean(task.metadata?.rewardClaimedAt ?? task.snapshot.rewardClaimedAt);
      this.ui.card(root, task.snapshot.title, `${task.snapshot.summary}${reward.length ? `\n奖励：${reward.join('、')}` : ''}`, -70, y, 500, 118, task.snapshot.isCompleted ? 'accent' : 'normal');
      if (task.status === 'completed' && !claimed) {
        this.ui.button(root, '领奖', 245, y, 120, () => void this.claimTask(task.id), { height: 52, fontSize: 18 });
      }
    });
    const pages = Math.max(1, Math.ceil(all.length / pageSize));
    this.ui.button(root, '上一页', -170, -390, 190, () => { this.taskPage = Math.max(0, this.taskPage - 1); this.renderTasks(); }, { secondary: true, disabled: this.taskPage === 0 });
    this.ui.text(root, `${this.taskPage + 1}/${pages}`, 0, -390, 19, InkColors.muted, 120);
    this.ui.button(root, '下一页', 170, -390, 190, () => { this.taskPage = Math.min(pages - 1, this.taskPage + 1); this.renderTasks(); }, { secondary: true, disabled: this.taskPage >= pages - 1 });
    this.renderNav(root);
  }

  private async claimTask(id: string): Promise<void> {
    try {
      await stageOneApi.claimTask(id);
      this.tasks = await stageOneApi.loadTasks();
      await this.refreshPlayer(false);
      this.renderTasks();
      this.ui.toast('奖励已领取', 'success');
    } catch (error) {
      this.ui.toast(this.message(error, '领取失败'), 'danger');
    }
  }

  private async renderMail(): Promise<void> {
    const root = this.ui.reset('Mail');
    this.renderHeader(root, '传音玉简');
    if (!this.mails.length && this.mailPage === 0) {
      this.ui.text(root, '正在接收灵讯…', 0, 250, 24, InkColors.muted, 620);
      this.renderNav(root);
      try {
        this.mails = (await stageOneApi.loadMail(1, 30)).mails;
        this.renderMail();
      } catch (error) {
        this.ui.toast(this.message(error, '玉简读取失败'), 'danger');
      }
      return;
    }
    this.ui.button(root, '全部已读', -130, 425, 210, () => void this.readAllMail(), { secondary: true, height: 52, fontSize: 18 });
    this.ui.button(root, '一键领取', 130, 425, 210, () => void this.claimAllMail(), { height: 52, fontSize: 18 });
    const pageSize = 5;
    const start = this.mailPage * pageSize;
    this.mails.slice(start, start + pageSize).forEach((mail, index) => {
      const y = 320 - index * 145;
      const prefix = `${mail.isRead ? '' : '● '}${mail.type === 'reward' && !mail.isClaimed ? '🎁 ' : ''}`;
      this.ui.card(root, `${prefix}${mail.title}`, mail.content, -70, y, 500, 118, !mail.isRead ? 'accent' : 'normal');
      this.ui.button(root, mail.type === 'reward' && !mail.isClaimed ? '领取' : '已读', 245, y, 120, () => void this.openMail(mail), { secondary: mail.isClaimed || mail.type !== 'reward', height: 52, fontSize: 18 });
    });
    const pages = Math.max(1, Math.ceil(this.mails.length / pageSize));
    this.ui.button(root, '上一页', -170, -390, 190, () => { this.mailPage = Math.max(0, this.mailPage - 1); this.renderMail(); }, { secondary: true, disabled: this.mailPage === 0 });
    this.ui.text(root, `${this.mailPage + 1}/${pages}`, 0, -390, 19, InkColors.muted, 120);
    this.ui.button(root, '下一页', 170, -390, 190, () => { this.mailPage = Math.min(pages - 1, this.mailPage + 1); this.renderMail(); }, { secondary: true, disabled: this.mailPage >= pages - 1 });
    this.renderNav(root);
  }

  private async openMail(mail: MailView): Promise<void> {
    try {
      if (!mail.isRead) await stageOneApi.readMail(mail.id);
      if (mail.type === 'reward' && !mail.isClaimed) await stageOneApi.claimMail(mail.id);
      this.mails = (await stageOneApi.loadMail(1, 30)).mails;
      await this.refreshPlayer(false);
      this.renderMail();
      this.ui.toast(mail.type === 'reward' && !mail.isClaimed ? '附件已领取' : '已标记为已读', 'success');
    } catch (error) {
      this.ui.toast(this.message(error, '处理玉简失败'), 'danger');
    }
  }

  private async readAllMail(): Promise<void> {
    try {
      await stageOneApi.readAllMail();
      this.mails = (await stageOneApi.loadMail(1, 30)).mails;
      await this.refreshPlayer(false);
      this.renderMail();
      this.ui.toast('全部已读', 'success');
    } catch (error) {
      this.ui.toast(this.message(error, '处理失败'), 'danger');
    }
  }

  private async claimAllMail(): Promise<void> {
    try {
      await stageOneApi.claimAllMail();
      this.mails = (await stageOneApi.loadMail(1, 30)).mails;
      await this.refreshPlayer(false);
      this.renderMail();
      this.ui.toast('可领取附件已处理', 'success');
    } catch (error) {
      this.ui.toast(this.message(error, '领取失败'), 'danger');
    }
  }

  private async loadStory(render = true): Promise<void> {
    if (this.storyLoading || !this.player?.cultivatorId) return;
    this.storyLoading = true;
    try {
      this.story = await stageOneApi.loadStory();
      if (render) this.renderHome();
    } catch {
      this.story = null;
    } finally {
      this.storyLoading = false;
    }
  }

  private async openCurrentStory(): Promise<void> {
    if (!this.story) await this.loadStory(false);
    const story = this.story;
    if (!story) return this.ui.toast('玉简暂时没有新字');
    if (story.kind === 'performance' && story.scriptId) {
      this.renderLoading('玉简正在显字…');
      try {
        this.performanceScript = await stageOneApi.loadPerformance(story.scriptId);
        this.performanceRunner = new PerformanceRunner(this.performanceScript);
        this.renderPerformance(this.performanceRunner.frame());
      } catch (error) {
        this.renderHome();
        this.ui.toast(this.message(error, '演出读取失败'), 'danger');
      }
      return;
    }
    if (story.kind === 'practice' && story.guideLesson === 'cave-layout') {
      return this.renderCaveGuide(0);
    }
    const root = this.ui.reset('StoryGate');
    this.ui.title(root, story.chapterTitle, 470);
    this.ui.text(root, story.prompt, 0, 320, 25, InkColors.ink, 620, 140);
    this.ui.text(root, `当前需要进入“${this.sceneLabel(story.scene)}”继续。该玩法将在第二大阶段接入微信 Cocos 表现层；服务端进度不会被伪造完成。`, 0, 130, 22, InkColors.warning, 620, 180);
    this.ui.button(root, '返回洞府', 0, -120, 260, () => this.renderHome(), { secondary: true });
  }

  private renderPerformance(frame: PerformanceFrame): void {
    const runner = this.performanceRunner;
    const story = this.story;
    if (!runner || !story?.scriptId) return this.renderHome();
    const root = this.ui.reset('Performance');
    this.ui.text(root, frame.title, 0, 535, 36, InkColors.ink, 650);
    if (frame.place) this.ui.text(root, `眼前 · ${frame.place}`, 0, 450, 20, InkColors.muted, 640, 100);
    if (frame.kind === 'text') {
      if (frame.kicker) this.ui.text(root, frame.kicker, 0, 390, 18, InkColors.muted, 600);
      if (frame.speaker) this.ui.text(root, frame.speaker, -260, 310, 24, InkColors.ink, 180, 48, HorizontalTextAlignment.LEFT);
      this.ui.text(root, frame.speaker ? `「${frame.text}」` : frame.text, 0, 160, 27, InkColors.ink, 620, 240);
      this.ui.button(root, '继续', 0, -120, 260, () => this.renderPerformance(runner.advance()));
    } else if (frame.kind === 'choice') {
      this.ui.text(root, '要怎么做？', 0, 300, 26, InkColors.ink, 620);
      frame.options.forEach((option, index) => {
        this.ui.button(root, `${index + 1}. ${option}`, 0, 170 - index * 95, 520, () => {
          const result = runner.choose(index);
          if (result.outcome) void this.finishPerformance(result.outcome);
          else this.renderPerformance(result.frame);
        }, { secondary: true });
      });
    } else {
      this.ui.text(root, '这一页已经读完。', 0, 220, 26, InkColors.ink, 620);
      this.ui.button(root, '落字并继续', 0, 20, 300, () => void this.finishPerformance(frame.outcome));
    }
    this.ui.button(root, '稍后再看', 0, -280, 220, () => this.renderHome(), { secondary: true });
  }

  private async finishPerformance(outcome: string): Promise<void> {
    const scriptId = this.story?.scriptId;
    if (!scriptId || this.busy) return;
    this.busy = true;
    try {
      await stageOneApi.completePerformance(scriptId, outcome);
      this.performanceRunner = null;
      this.performanceScript = null;
      await this.loadStory(false);
      await this.refreshPlayer(false);
      await this.openCurrentStory();
    } catch (error) {
      this.ui.toast(this.message(error, '这一页没能记住'), 'danger');
    } finally {
      this.busy = false;
    }
  }

  private renderCaveGuide(step: number): void {
    const steps = [
      '这些是洞府里面的地方。修炼、炼丹、炼器、悟道、阵纹、练功、储藏、灵田、育兽，都从这里走进去。',
      '灵眼之泉在洞府。气血和法力乱了，就来这里调养。',
      '出了洞府，可以外出云游、去坊市、进蜃楼幻境，或到拍卖行。',
    ];
    const root = this.ui.reset('CaveGuide');
    this.ui.title(root, '教学 · 洞府', 470);
    this.ui.text(root, steps[step] ?? '洞府教学结束。', 0, 245, 27, InkColors.ink, 620, 220);
    if (step < steps.length - 1) {
      this.ui.button(root, '知道了', 0, -30, 260, () => this.renderCaveGuide(step + 1));
    } else {
      this.ui.button(root, '完成教学', 0, -30, 280, async () => {
        try {
          await stageOneApi.completeGuide('cave-layout');
          await this.loadStory(false);
          this.renderHome();
          this.ui.toast('洞府教学已记入玉简', 'success');
        } catch (error) {
          this.ui.toast(this.message(error, '教学记录失败'), 'danger');
        }
      });
    }
    this.ui.button(root, '稍后再看', 0, -190, 220, () => this.renderHome(), { secondary: true });
  }

  private readSafeArea(): { top: number; bottom: number } {
    const runtime = (globalThis as {
      wx?: {
        getWindowInfo?: () => {
          windowHeight?: number;
          safeArea?: { top?: number; bottom?: number };
        };
      };
    }).wx;
    try {
      const info = runtime?.getWindowInfo?.();
      const height = info?.windowHeight;
      const area = info?.safeArea;
      if (!height || !area) return { top: 0, bottom: 0 };
      const scale = INK_HEIGHT / height;
      return {
        top: Math.max(0, (area.top ?? 0) * scale),
        bottom: Math.max(0, (height - (area.bottom ?? height)) * scale),
      };
    } catch {
      return { top: 0, bottom: 0 };
    }
  }

  private stat(root: Node, label: string, value: string, x: number, y: number): void {
    const card = this.ui.panel(root, x, y, 190, 105, InkColors.paperDeep, 12);
    this.ui.text(card, label, 0, 22, 19, InkColors.muted, 170, 38);
    this.ui.text(card, value, 0, -18, 27, InkColors.ink, 170, 44);
  }

  private number(value: number): string {
    if (Math.abs(value) < 10000) return String(value);
    if (Math.abs(value) < 100000000) return `${(value / 10000).toFixed(1)}万`;
    return `${(value / 100000000).toFixed(1)}亿`;
  }

  private sceneLabel(scene: string): string {
    return ({ alchemy: '炼丹', map: '地图', wild: '野外', beasts: '灵兽', refine: '炼器', sect: '宗门', cave: '洞府' } as Record<string, string>)[scene] ?? scene;
  }

  private message(error: unknown, fallback: string): string {
    return error instanceof Error && error.message ? error.message : fallback;
  }
}
