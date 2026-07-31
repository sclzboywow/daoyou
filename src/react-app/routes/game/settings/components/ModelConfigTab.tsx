import { InkButton } from '@app/components/ui/InkButton';
import { InkInput } from '@app/components/ui/InkInput';
import {
  DEEPSEEK_STORAGE_KEY,
  readStoredDeepSeekConfig,
} from '@app/lib/deepseekConfig';
import {
  DEEPSEEK_DEFAULT_MODEL,
  DeepSeekByokConfigSchema,
} from '@shared/config/deepseek';
import { useState } from 'react';
import {
  SettingsMessage,
  SettingsSection,
  settingsLabelClass,
} from './SettingsFields';

export function ModelConfigTab() {
  const stored = readStoredDeepSeekConfig();
  const [apiKey, setApiKey] = useState(stored?.apiKey || '');
  const [model, setModel] = useState(stored?.model || DEEPSEEK_DEFAULT_MODEL);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
  const [hasConfig, setHasConfig] = useState(!!stored);

  const canSubmit = apiKey.trim() && model.trim() && !loading;

  const handleSubmit = async () => {
    if (!canSubmit) return;

    const parsed = DeepSeekByokConfigSchema.safeParse({ apiKey, model });
    if (!parsed.success) {
      setMessage({ type: 'error', text: 'API Key 或模型格式无效' });
      return;
    }

    setLoading(true);
    setMessage(null);

    try {
      localStorage.setItem(
        DEEPSEEK_STORAGE_KEY,
        JSON.stringify(parsed.data),
      );
      setHasConfig(true);
      setMessage({ type: 'success', text: '配置已保存到浏览器本地。' });
    } catch {
      setMessage({ type: 'error', text: '保存失败，请稍后重试' });
    } finally {
      setLoading(false);
    }
  };

  const handleClear = () => {
    localStorage.removeItem(DEEPSEEK_STORAGE_KEY);
    setApiKey('');
    setModel(DEEPSEEK_DEFAULT_MODEL);
    setHasConfig(false);
    setMessage({ type: 'success', text: '已清除本地配置，恢复为服务器默认模型。' });
  };

  return (
    <div className="space-y-5">
      <InkInput
        label="DeepSeek API Key"
        type="password"
        placeholder="sk-..."
        value={apiKey}
        onChange={setApiKey}
        size="sm"
        labelClassName={settingsLabelClass}
      />

      <InkInput
        label="DeepSeek 模型"
        placeholder="如 deepseek-chat"
        value={model}
        onChange={setModel}
        size="sm"
        labelClassName={settingsLabelClass}
      />

      <div className="flex flex-wrap items-center gap-3">
        <InkButton
          variant="primary"
          onClick={handleSubmit}
          disabled={!canSubmit}
        >
          {loading ? '保存中...' : '保存配置'}
        </InkButton>

        {hasConfig ? (
          <InkButton
            variant="secondary"
            onClick={handleClear}
            disabled={loading}
          >
            清除配置
          </InkButton>
        ) : null}

        {message ? (
          <SettingsMessage type={message.type}>
            {message.text}
          </SettingsMessage>
        ) : null}
      </div>

      <SettingsSection>
        <p className="text-ink-secondary text-sm leading-6">
          仅支持 DeepSeek 官方服务。配置保存在浏览器 localStorage 中，仅当前设备生效，更换浏览器或清除缓存后需要重新配置。
          <br />
          API Key 仅在前端本地存储，服务端通过请求头获取并调用，不会在服务器持久化保存。
        </p>
      </SettingsSection>
    </div>
  );
}
