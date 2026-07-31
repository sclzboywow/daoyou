import { InkButton } from '@app/components/ui/InkButton';
import { usePwaInstall } from '@app/components/providers/PwaInstallProvider';
import { useCultivatorIdentity } from '@app/lib/resources/player';
import { useState } from 'react';
import {
  SettingsField,
  SettingsMessage,
  SettingsSection,
} from './SettingsFields';
import { formatDateTime } from './utils';

export function GameSettingsTab() {
  const cultivator = useCultivatorIdentity().data?.cultivator;
  const pwa = usePwaInstall();
  const [copyMessage, setCopyMessage] = useState<string | null>(null);
  const [installMessage, setInstallMessage] = useState<string | null>(null);
  const cultivatorId = cultivator?.id ?? '';

  const handleCopyCultivatorId = async () => {
    if (!cultivatorId) return;

    try {
      await navigator.clipboard.writeText(cultivatorId);
      setCopyMessage('已复制');
    } catch {
      setCopyMessage('复制失败');
    }
  };

  const handleInstall = async () => {
    const outcome = await pwa.install();
    setInstallMessage(
      outcome === 'accepted'
        ? '安装请求已接受'
        : outcome === 'dismissed'
          ? '已取消安装'
          : outcome === 'unavailable'
            ? '当前环境无法安装'
            : null,
    );
  };

  const installValue =
    pwa.status === 'installed'
      ? pwa.standalone
        ? '已从主屏幕启动'
        : '已安装到设备'
      : pwa.status === 'promptable'
        ? '可直接安装'
        : pwa.status === 'manual'
          ? '可手动添加到主屏幕'
          : '当前环境不可安装';

  return (
    <div className="space-y-6">
      <SettingsSection>
        <SettingsField
          label="角色 ID"
          value={cultivatorId || '—'}
          mono
          action={
            cultivatorId ? (
              <InkButton variant="secondary" onClick={handleCopyCultivatorId}>
                复制
              </InkButton>
            ) : null
          }
        />
        <SettingsField
          label="角色创建时间"
          value={formatDateTime(cultivator?.createdAt)}
        />
      </SettingsSection>
      {copyMessage ? <SettingsMessage>{copyMessage}</SettingsMessage> : null}
      <SettingsSection
        title="移动端体验"
        description="从主屏幕启动可隐藏浏览器地址栏，小游戏会继续按设备能力申请横屏。"
      >
        <SettingsField
          label="安装状态"
          value={installValue}
          action={
            pwa.status === 'installed' || pwa.status === 'unavailable' ? null : (
              <InkButton variant="secondary" onClick={() => void handleInstall()}>
                {pwa.status === 'promptable' ? '安装到设备' : '查看方法'}
              </InkButton>
            )
          }
        />
      </SettingsSection>
      {installMessage ? (
        <SettingsMessage>{installMessage}</SettingsMessage>
      ) : null}
    </div>
  );
}
