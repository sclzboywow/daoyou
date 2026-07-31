import { InkButton } from '@app/components/ui/InkButton';
import { InkInput } from '@app/components/ui/InkInput';
import { InkSelect } from '@app/components/ui/InkSelect';
import { findLlmProvider, LLM_PROVIDERS } from '@shared/config/llmProviders';
import { useState } from 'react';
import {
  SettingsMessage,
  SettingsSection,
  settingsLabelClass,
} from './SettingsFields';

const STORAGE_KEY = 'daoyou_llm_config';
const DEFAULT_PROVIDER = LLM_PROVIDERS[0].id;

function readStoredConfig() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as Record<string, string>;
  } catch {
    // ignore invalid local config
  }
  return null;
}

export function ModelConfigTab() {
  const stored = readStoredConfig();
  const defaultProvider = findLlmProvider(stored?.provider || DEFAULT_PROVIDER)
    ? stored?.provider || DEFAULT_PROVIDER
    : DEFAULT_PROVIDER;
  const fallbackProvider = findLlmProvider(defaultProvider) ?? LLM_PROVIDERS[0];
  const [provider, setProvider] = useState(defaultProvider);
  const [apiKey, setApiKey] = useState(stored?.apiKey || '');
  const [model, setModel] = useState(
    stored?.model || fallbackProvider.model || '',
  );
  const [fastModel, setFastModel] = useState(
    stored?.fastModel || fallbackProvider.fastModel || '',
  );
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
  const [hasConfig, setHasConfig] = useState(!!stored);

  const currentProvider = findLlmProvider(provider);
  const canSubmit = provider && apiKey && model && fastModel && !loading;

  const handleProviderChange = (value: string) => {
    setProvider(value);
    const next = findLlmProvider(value);
    if (next) {
      setModel(next.model);
      setFastModel(next.fastModel);
    }
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;

    setLoading(true);
    setMessage(null);

    try {
      const config = {
        provider,
        apiKey,
        baseUrl: currentProvider?.baseUrl || '',
        model,
        fastModel,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
      setHasConfig(true);
      setMessage({ type: 'success', text: '配置已保存到浏览器本地。' });
    } catch {
      setMessage({ type: 'error', text: '保存失败，请稍后重试' });
    } finally {
      setLoading(false);
    }
  };

  const handleClear = () => {
    localStorage.removeItem(STORAGE_KEY);
    const defaults = LLM_PROVIDERS[0];
    setProvider(defaults.id);
    setApiKey('');
    setModel(defaults.model);
    setFastModel(defaults.fastModel);
    setHasConfig(false);
    setMessage({ type: 'success', text: '已清除本地配置，恢复为服务器默认模型。' });
  };

  return (
    <div className="space-y-5">
      <InkSelect
        label="服务商"
        value={provider}
        onChange={handleProviderChange}
        size="sm"
        labelClassName={settingsLabelClass}
      >
        {LLM_PROVIDERS.map((item) => (
          <option key={item.id} value={item.id}>
            {item.label}
          </option>
        ))}
      </InkSelect>

      <InkInput
        label="API Key"
        type="password"
        placeholder="sk-..."
        value={apiKey}
        onChange={setApiKey}
        size="sm"
        labelClassName={settingsLabelClass}
      />

      <div className="flex flex-col gap-1">
        <span className={settingsLabelClass}>Base URL</span>
        <span className="border-ink/10 text-ink-secondary bg-ink/5 border border-dashed px-2 py-2 font-mono text-sm select-all">
          {currentProvider?.baseUrl || '—'}
        </span>
        <span className="text-ink-secondary text-xs leading-5">
          由所选服务商自动确定，不支持自定义输入
        </span>
      </div>

      <InkInput
        label="普通模型"
        placeholder="如 deepseek-chat"
        value={model}
        onChange={setModel}
        size="sm"
        labelClassName={settingsLabelClass}
      />

      <InkInput
        label="Fast 模型"
        placeholder="如 deepseek-chat"
        value={fastModel}
        onChange={setFastModel}
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
          配置保存在浏览器 localStorage 中，仅当前设备生效，更换浏览器或清除缓存后需要重新配置。
          <br />
          API Key 仅在前端本地存储，服务端通过请求头获取并调用，不会在服务器持久化保存。
        </p>
      </SettingsSection>
    </div>
  );
}
