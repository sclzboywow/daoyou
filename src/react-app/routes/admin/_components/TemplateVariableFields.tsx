import { InkInput } from '@app/components/ui/InkInput';
import { InkNotice } from '@app/components/ui/InkNotice';

export interface BroadcastTemplateOption {
  id: string;
  name: string;
  subjectTemplate?: string | null;
  contentTemplate?: string;
  defaultPayload?: Record<string, string | number>;
}

interface TemplateVariableFieldsProps {
  template?: BroadcastTemplateOption;
  value: Record<string, string | number>;
  onChange: (value: Record<string, string | number>) => void;
  disabled?: boolean;
}

export function getTemplateVariableNames(
  template?: BroadcastTemplateOption,
): string[] {
  if (!template) return [];

  const names = new Set(Object.keys(template.defaultPayload ?? {}));
  const source = `${template.subjectTemplate ?? ''}\n${template.contentTemplate ?? ''}`;
  const matcher = /{{\s*([A-Za-z0-9_.-]+)\s*}}/g;

  for (const match of source.matchAll(matcher)) {
    if (match[1]) names.add(match[1]);
  }

  return [...names];
}

export function createTemplatePayload(
  template?: BroadcastTemplateOption,
): Record<string, string | number> {
  if (!template) return {};

  return Object.fromEntries(
    getTemplateVariableNames(template).map((name) => [
      name,
      template.defaultPayload?.[name] ?? '',
    ]),
  );
}

export function TemplateVariableFields({
  template,
  value,
  onChange,
  disabled = false,
}: TemplateVariableFieldsProps) {
  if (!template) return null;

  const variableNames = getTemplateVariableNames(template);

  if (variableNames.length === 0) {
    return (
      <InkNotice tone="muted">
        当前模板没有需要填写的变量，可直接继续配置发送范围。
      </InkNotice>
    );
  }

  return (
    <div className="border-ink/15 bg-bgpaper/60 space-y-3 border border-dashed p-4">
      <div>
        <p className="text-ink font-semibold tracking-[0.08em]">模板变量</p>
        <p className="text-ink-secondary mt-1 text-sm">
          已按模板自动列出，无需填写 JSON。
        </p>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {variableNames.map((name) => (
          <InkInput
            key={name}
            label={name}
            value={String(value[name] ?? '')}
            onChange={(nextValue) =>
              onChange({
                ...value,
                [name]: nextValue,
              })
            }
            placeholder={`请输入 ${name}`}
            disabled={disabled}
          />
        ))}
      </div>
    </div>
  );
}
