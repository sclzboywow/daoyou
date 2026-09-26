import { _decorator, Component, Label } from 'cc';
import { authFlow } from './AuthFlow';

const { ccclass, property } = _decorator;

@ccclass('WechatBootstrap')
export class WechatBootstrap extends Component {
  @property(Label)
  statusLabel: Label | null = null;

  async start(): Promise<void> {
    this.setStatus('正在连接云梦界…');
    const state = await authFlow.tryWechatSignIn();

    if (state.status === 'signed-in') {
      this.setStatus(`已登录：${state.name}`);
      this.node.emit('daoyou-auth-ready', state);
      return;
    }

    if (state.status === 'unlinked') {
      this.setStatus('当前微信尚未绑定账号');
      this.node.emit('daoyou-auth-unlinked');
      return;
    }

    this.setStatus(state.message);
    this.node.emit('daoyou-auth-error', state);
  }

  private setStatus(text: string): void {
    if (this.statusLabel) this.statusLabel.string = text;
    console.info('[wechat-bootstrap]', text);
  }
}
