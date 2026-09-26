import { ApiError } from '../api/ApiClient';
import { authClient } from '../api/AuthClient';

export type AuthFlowState =
  | { status: 'signed-in'; userId: string; name: string }
  | { status: 'unlinked' }
  | { status: 'error'; message: string; code?: string };

export class AuthFlow {
  async tryWechatSignIn(): Promise<AuthFlowState> {
    try {
      const session = await authClient.signInWechat();
      return {
        status: 'signed-in',
        userId: session.user.id,
        name: session.user.name,
      };
    } catch (error) {
      if (error instanceof ApiError && error.code === 'WECHAT_ACCOUNT_UNLINKED') {
        return { status: 'unlinked' };
      }
      return {
        status: 'error',
        message: error instanceof Error ? error.message : '微信登录失败',
        code: error instanceof ApiError ? error.code : undefined,
      };
    }
  }

  async registerNewWechatUser(name: string): Promise<AuthFlowState> {
    try {
      const session = await authClient.registerWechat(name);
      return {
        status: 'signed-in',
        userId: session.user.id,
        name: session.user.name,
      };
    } catch (error) {
      return {
        status: 'error',
        message: error instanceof Error ? error.message : '微信注册失败',
        code: error instanceof ApiError ? error.code : undefined,
      };
    }
  }

  sendExistingAccountOtp(email: string): Promise<void> {
    return authClient.sendEmailOtp(email);
  }

  async signInExistingAccount(input: {
    email: string;
    otp: string;
    name?: string;
  }): Promise<void> {
    await authClient.signInEmailOtp(input);
  }

  bindCurrentWechatIdentity(): Promise<void> {
    return authClient.bindCurrentWechatIdentity();
  }
}

export const authFlow = new AuthFlow();
