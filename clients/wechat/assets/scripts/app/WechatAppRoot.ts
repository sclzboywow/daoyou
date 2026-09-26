import {
  _decorator,
  Button,
  Color,
  Component,
  EditBox,
  Graphics,
  HorizontalTextAlignment,
  Label,
  Layers,
  Node,
  UITransform,
  Vec3,
  VerticalTextAlignment,
} from 'cc';
import { authFlow, type AuthFlowState } from './AuthFlow';
import { gameApi } from '../game/GameApi';
import { gameStateStore, type GameStateSnapshot } from '../game/GameStateStore';
import type { InventorySummary } from '../game/GameTypes';
import { StageOneController } from '../stage-one/StageOneController';

const { ccclass } = _decorator;
const UI_LAYER = Layers.Enum.UI_2D;
const WIDTH = 750;
const HEIGHT = 1334;

const COLORS = {
  ink: new Color(42, 43, 38, 255),
  muted: new Color(105, 105, 96, 255),
  paper: new Color(246, 242, 232, 255),
  paperDeep: new Color(230, 223, 207, 255),
  accent: new Color(88, 100, 82, 255),
  danger: new Color(128, 72, 66, 255),
  white: new Color(252, 250, 245, 255),
};

@ccclass('WechatAppRoot')
export class WechatAppRoot extends Component {
  private uiRoot: Node | null = null;
  private currentUserName = '';
  private currentTab: 'home' | 'inventory' = 'home';
  private unsubscribeState: (() => void) | null = null;
  private titleInput: EditBox | null = null;
  private stageOne: StageOneController | null = null;

  async start(): Promise<void> {
    this.stageOne = new StageOneController(this.node);
    await this.stageOne.start();
  }

  onDestroy(): void {
    this.stageOne?.destroy();
    this.stageOne = null;
  }

  private async routeAuthState(state: AuthFlowState): Promise<void> {
    if (state.status === 'signed-in') {
      this.currentUserName = state.name;
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
    this.renderLoading('正在读取角色与背包…');
    try {
      await gameStateStore.refresh();
      if (!this.unsubscribeState) {
        this.unsubscribeState = gameStateStore.subscribe((state) => {
          if (!this.uiRoot) return;
          this.renderCurrentGameTab(state);
        });
      }
      gameStateStore.connectRealtime();
      this.renderCurrentGameTab(gameStateStore.snapshot());
    } catch (error) {
      this.renderError(error instanceof Error ? error.message : '加载角色失败');
    }
  }

  private renderLoading(message: string): void {
    const root = this.resetUi();
    this.createTitle(root, '万界道友 · 云梦界', 0, 430);
    this.createText(root, message, 0, 300, 30, COLORS.muted, 620);
  }

  private renderError(message: string): void {
    const root = this.resetUi();
    this.createTitle(root, '连接失败', 0, 430);
    this.createText(root, message, 0, 300, 26, COLORS.danger, 620);
    this.createButton(root, '重新尝试', 0, 120, 280, () => void this.restartAuth());
  }

  private async restartAuth(): Promise<void> {
    this.renderLoading('正在重新连接…');
    const state = await authFlow.tryWechatSignIn();
    await this.routeAuthState(state);
  }

  private renderUnlinked(): void {
    const root = this.resetUi();
    this.createTitle(root, '初入云梦', 0, 430);
    this.createText(
      root,
      '当前微信尚未绑定云梦界账号。已有 Web 角色请选择“已有账号”，避免生成第二个角色。',
      0,
      300,
      27,
      COLORS.ink,
      620,
    );
    this.createButton(root, '已有云梦界账号', 0, 90, 430, () =>
      this.renderExistingAccount(),
    );
    this.createButton(root, '我是新玩家', 0, -30, 430, () =>
      this.renderNewAccount(),
    );
    this.createText(
      root,
      '绑定后，微信与 Web 使用同一 userId、同一角色、同一背包。',
      0,
      -190,
      22,
      COLORS.muted,
      620,
    );
  }

  private renderExistingAccount(): void {
    const root = this.resetUi();
    this.createTitle(root, '绑定已有账号', 0, 470);
    this.createText(
      root,
      '填写 Web 端使用的邮箱。验证码登录成功后，会把当前微信 OpenID 绑定到原账号。',
      0,
      365,
      24,
      COLORS.muted,
      620,
    );
    const email = this.createInput(root, 'Web 账号邮箱', 0, 220, 560, 72, 100);
    const otp = this.createInput(root, '6 位邮箱验证码', 0, 105, 560, 72, 12);
    const status = this.createText(root, '', 0, -10, 22, COLORS.muted, 620);

    this.createButton(root, '发送验证码', -165, -125, 250, async () => {
      const value = email.string.trim();
      if (!value) {
        status.string = '请先填写邮箱';
        return;
      }
      status.string = '正在发送验证码…';
      try {
        await authFlow.sendExistingAccountOtp(value);
        status.string = '验证码已发送，请查看邮箱';
      } catch (error) {
        status.string = error instanceof Error ? error.message : '验证码发送失败';
      }
    });
    this.createButton(root, '登录并绑定微信', 165, -125, 250, async () => {
      const emailValue = email.string.trim();
      const otpValue = otp.string.trim();
      if (!emailValue || !otpValue) {
        status.string = '请填写邮箱和验证码';
        return;
      }
      status.string = '正在验证并绑定…';
      try {
        await authFlow.signInExistingAccount({ email: emailValue, otp: otpValue });
        await authFlow.bindCurrentWechatIdentity();
        const state = await authFlow.tryWechatSignIn();
        await this.routeAuthState(state);
      } catch (error) {
        status.string = error instanceof Error ? error.message : '绑定失败';
      }
    });
    this.createButton(root, '返回', 0, -280, 220, () => this.renderUnlinked(), true);
  }

  private renderNewAccount(): void {
    const root = this.resetUi();
    this.createTitle(root, '创建云梦界账号', 0, 470);
    this.createText(
      root,
      '仅确认没有既有 Web 账号时使用。新账号会创建新的 Better Auth userId。',
      0,
      350,
      24,
      COLORS.danger,
      620,
    );
    const name = this.createInput(root, '道友昵称', 0, 190, 520, 72, 32);
    const status = this.createText(root, '', 0, 70, 22, COLORS.muted, 620);
    this.createButton(root, '确认创建', 0, -60, 360, async () => {
      const value = name.string.trim();
      if (!value) {
        status.string = '请填写昵称';
        return;
      }
      status.string = '正在创建账号…';
      const state = await authFlow.registerNewWechatUser(value);
      if (state.status === 'signed-in') {
        await this.routeAuthState(state);
      } else {
        status.string = state.status === 'error' ? state.message : '创建失败';
      }
    });
    this.createButton(root, '返回', 0, -220, 220, () => this.renderUnlinked(), true);
  }

  private renderCurrentGameTab(state: GameStateSnapshot): void {
    if (this.currentTab === 'inventory') this.renderInventory(state);
    else this.renderHome(state);
  }

  private renderHome(state: GameStateSnapshot): void {
    const root = this.resetUi();
    this.createHeader(root, state, '洞府');
    const dashboard = state.dashboard;
    if (!dashboard?.cultivatorId || !dashboard.cultivator) {
      this.createText(
        root,
        dashboard?.note || '当前账号暂无活跃角色。V1.1 已完成账号互通，角色创建流程将在下一阶段接入。',
        0,
        220,
        26,
        COLORS.muted,
        620,
      );
      this.createNav(root);
      return;
    }

    const cultivator = dashboard.cultivator;
    const currency = dashboard.currency;
    this.createText(
      root,
      `${cultivator.title ? `「${cultivator.title}」` : ''}${cultivator.name}`,
      0,
      350,
      38,
      COLORS.ink,
      620,
    );
    this.createText(
      root,
      `${cultivator.realm} · ${cultivator.realm_stage}　寿元 ${cultivator.age}/${cultivator.lifespan}`,
      0,
      292,
      25,
      COLORS.muted,
      620,
    );
    this.createStatCard(root, '天地灵气', String(currency?.qi ?? 0), -210, 180);
    this.createStatCard(root, '灵石', this.formatNumber(currency?.spiritStones ?? 0), 0, 180);
    this.createStatCard(root, '声望', this.formatNumber(currency?.reputation ?? 0), 210, 180);
    this.createStatCard(root, '未读玉简', String(dashboard.unreadMail), -210, 40);
    this.createStatCard(root, '进行任务', String(dashboard.activeTasks), 0, 40);
    this.createStatCard(root, '可领奖励', String(dashboard.claimableTasks), 210, 40);

    this.titleInput = this.createInput(
      root,
      cultivator.title || '输入 2–8 字称号',
      -105,
      -115,
      410,
      64,
      8,
    );
    if (cultivator.title) this.titleInput.string = cultivator.title;
    const status = this.createText(root, '', 0, -180, 20, COLORS.muted, 620);
    this.createButton(root, '保存称号', 220, -115, 180, async () => {
      const value = this.titleInput?.string.trim() ?? '';
      if (value && (value.length < 2 || value.length > 8)) {
        status.string = '称号需要 2–8 个字符';
        return;
      }
      status.string = '正在保存…';
      try {
        await gameApi.updateTitle(value || null);
        await gameStateStore.refresh();
        status.string = '已保存；Web 端会读取同一角色数据';
      } catch (error) {
        status.string = error instanceof Error ? error.message : '保存失败';
      }
    });

    this.createText(
      root,
      `实时：${this.realtimeLabel(state.realtime)}　服务器时间：${this.shortTime(dashboard.serverTime)}`,
      0,
      -260,
      20,
      state.realtime === 'ready' ? COLORS.accent : COLORS.muted,
      650,
    );
    if (state.lastError) {
      this.createText(root, state.lastError, 0, -310, 20, COLORS.danger, 650);
    }
    this.createNav(root);
  }

  private renderInventory(state: GameStateSnapshot): void {
    const root = this.resetUi();
    this.createHeader(root, state, '背包');
    const inventory = state.inventory;
    if (!state.dashboard?.cultivatorId) {
      this.createText(root, '当前没有活跃角色，无法读取背包。', 0, 220, 26, COLORS.muted, 620);
      this.createNav(root);
      return;
    }
    if (!inventory) {
      this.createText(root, '正在读取背包…', 0, 220, 26, COLORS.muted, 620);
      this.createNav(root);
      return;
    }

    this.createText(
      root,
      `法宝 ${inventory.totals.artifacts}　材料 ${inventory.totals.materials}　消耗品 ${inventory.totals.consumables}`,
      0,
      360,
      25,
      COLORS.ink,
      650,
    );
    this.renderInventoryItems(root, inventory);
    this.createNav(root);
  }

  private renderInventoryItems(root: Node, inventory: InventorySummary): void {
    const items = inventory.items.slice(0, 18);
    if (!items.length) {
      this.createText(root, '背包为空', 0, 260, 26, COLORS.muted, 620);
      return;
    }
    items.forEach((item, index) => {
      const col = index % 2;
      const row = Math.floor(index / 2);
      const x = col === 0 ? -175 : 175;
      const y = 300 - row * 70;
      const suffix = typeof item.quantity === 'number' ? ` ×${item.quantity}` : '';
      const prefix =
        item.category === 'artifacts' ? '法' : item.category === 'materials' ? '材' : '用';
      this.createText(root, `【${prefix}】${item.name}${suffix}`, x, y, 21, COLORS.ink, 320);
    });
  }

  private createHeader(root: Node, state: GameStateSnapshot, title: string): void {
    this.createText(root, '万界道友 · 云梦界', -210, 565, 25, COLORS.muted, 300);
    this.createText(root, title, 0, 500, 40, COLORS.ink, 400);
    this.createText(
      root,
      this.currentUserName ? `账号：${this.currentUserName}` : '',
      210,
      565,
      20,
      COLORS.muted,
      300,
    );
    if (state.realtime === 'error') {
      this.createText(root, '实时连接异常，页面仍可手动刷新', 0, 445, 20, COLORS.danger, 620);
    }
  }

  private createNav(root: Node): void {
    this.createButton(root, '首页', -235, -555, 180, () => {
      this.currentTab = 'home';
      this.renderCurrentGameTab(gameStateStore.snapshot());
    }, this.currentTab !== 'home');
    this.createButton(root, '背包', 0, -555, 180, () => {
      this.currentTab = 'inventory';
      this.renderCurrentGameTab(gameStateStore.snapshot());
    }, this.currentTab !== 'inventory');
    this.createButton(root, '刷新', 235, -555, 180, async () => {
      await gameStateStore.refresh().catch(() => undefined);
    }, true);
  }

  private createStatCard(root: Node, label: string, value: string, x: number, y: number): void {
    const card = this.createPanel(root, x, y, 190, 105, COLORS.paperDeep, 14);
    this.createText(card, label, 0, 22, 20, COLORS.muted, 170);
    this.createText(card, value, 0, -19, 28, COLORS.ink, 170);
  }

  private resetUi(): Node {
    this.uiRoot?.destroy();
    const root = new Node('DaoyouUI');
    root.layer = UI_LAYER;
    this.node.addChild(root);
    const transform = root.addComponent(UITransform);
    transform.setContentSize(WIDTH, HEIGHT);
    root.setPosition(Vec3.ZERO);
    const graphics = root.addComponent(Graphics);
    graphics.fillColor = COLORS.paper;
    graphics.rect(-WIDTH / 2, -HEIGHT / 2, WIDTH, HEIGHT);
    graphics.fill();
    this.uiRoot = root;
    return root;
  }

  private createTitle(parent: Node, text: string, x: number, y: number): Label {
    return this.createText(parent, text, x, y, 46, COLORS.ink, 660);
  }

  private createText(
    parent: Node,
    text: string,
    x: number,
    y: number,
    fontSize: number,
    color: Color,
    width: number,
  ): Label {
    const node = new Node('Label');
    node.layer = UI_LAYER;
    parent.addChild(node);
    node.setPosition(new Vec3(x, y, 0));
    const transform = node.addComponent(UITransform);
    transform.setContentSize(width, Math.max(fontSize + 16, 54));
    const label = node.addComponent(Label);
    label.string = text;
    label.fontSize = fontSize;
    label.lineHeight = fontSize + 8;
    label.color = color;
    label.enableWrapText = true;
    label.horizontalAlign = HorizontalTextAlignment.CENTER;
    label.verticalAlign = VerticalTextAlignment.CENTER;
    return label;
  }

  private createPanel(
    parent: Node,
    x: number,
    y: number,
    width: number,
    height: number,
    color: Color,
    radius = 10,
  ): Node {
    const node = new Node('Panel');
    node.layer = UI_LAYER;
    parent.addChild(node);
    node.setPosition(new Vec3(x, y, 0));
    const transform = node.addComponent(UITransform);
    transform.setContentSize(width, height);
    const graphics = node.addComponent(Graphics);
    graphics.fillColor = color;
    graphics.roundRect(-width / 2, -height / 2, width, height, radius);
    graphics.fill();
    return node;
  }

  private createButton(
    parent: Node,
    text: string,
    x: number,
    y: number,
    width: number,
    handler: () => void | Promise<void>,
    secondary = false,
  ): Node {
    const buttonNode = this.createPanel(
      parent,
      x,
      y,
      width,
      70,
      secondary ? COLORS.paperDeep : COLORS.accent,
      12,
    );
    const button = buttonNode.addComponent(Button);
    button.transition = Button.Transition.NONE;
    const label = this.createText(
      buttonNode,
      text,
      0,
      -2,
      24,
      secondary ? COLORS.ink : COLORS.white,
      width - 20,
    );
    label.node.setSiblingIndex(buttonNode.children.length - 1);
    buttonNode.on(Button.EventType.CLICK, () => void handler(), this);
    return buttonNode;
  }

  private createInput(
    parent: Node,
    placeholder: string,
    x: number,
    y: number,
    width: number,
    height: number,
    maxLength: number,
  ): EditBox {
    const box = this.createPanel(parent, x, y, width, height, COLORS.white, 10);
    const textNode = new Node('Text');
    textNode.layer = UI_LAYER;
    box.addChild(textNode);
    const textTransform = textNode.addComponent(UITransform);
    textTransform.setContentSize(width - 32, height - 10);
    const textLabel = textNode.addComponent(Label);
    textLabel.fontSize = 24;
    textLabel.lineHeight = 30;
    textLabel.color = COLORS.ink;

    const placeholderNode = new Node('Placeholder');
    placeholderNode.layer = UI_LAYER;
    box.addChild(placeholderNode);
    const placeholderTransform = placeholderNode.addComponent(UITransform);
    placeholderTransform.setContentSize(width - 32, height - 10);
    const placeholderLabel = placeholderNode.addComponent(Label);
    placeholderLabel.string = placeholder;
    placeholderLabel.fontSize = 24;
    placeholderLabel.lineHeight = 30;
    placeholderLabel.color = COLORS.muted;

    const edit = box.addComponent(EditBox);
    edit.textLabel = textLabel;
    edit.placeholderLabel = placeholderLabel;
    edit.placeholder = placeholder;
    edit.maxLength = maxLength;
    edit.returnType = EditBox.KeyboardReturnType.DONE;
    return edit;
  }

  private formatNumber(value: number): string {
    if (Math.abs(value) < 10000) return String(value);
    if (Math.abs(value) < 100000000) return `${(value / 10000).toFixed(1)}万`;
    return `${(value / 100000000).toFixed(1)}亿`;
  }

  private shortTime(value: string): string {
    return value.replace('T', ' ').replace(/\.\d{3}Z$/, 'Z').slice(0, 19);
  }

  private realtimeLabel(state: GameStateSnapshot['realtime']): string {
    if (state === 'ready') return '已连接';
    if (state === 'connecting') return '连接中';
    if (state === 'error') return '异常';
    return '离线';
  }
}
