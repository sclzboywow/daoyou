import { AuthChoiceCard, AuthPageShell } from '@app/components/auth';
import { InkButton } from '@app/components/ui/InkButton';

export default function SignupRoute() {
  return (
    <AuthPageShell
      title="【注册】"
      lead="选择一种注册方式。"
      footer={
        <div className="flex items-center justify-center gap-2">
          <span className="text-ink-secondary">已有账号？</span>
          <InkButton href="/login" variant="primary">
            去登录
          </InkButton>
        </div>
      }
    >
      <div className="space-y-3">
        <AuthChoiceCard
          href="/login/email?source=signup"
          title="邮箱验证码"
          description="通过邮箱验证码注册，验证后会自动登录。"
          accent="primary"
        />
        <AuthChoiceCard
          href="/signup/password"
          title="密码注册"
          description="使用邮箱、昵称和密码创建账号，并通过验证邮件激活。"
        />
      </div>
    </AuthPageShell>
  );
}
