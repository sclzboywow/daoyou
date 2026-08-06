export interface BroadcastTemplateOption {
  id: string;
  name: string;
  subjectTemplate?: string | null;
  contentTemplate?: string;
  defaultPayload?: Record<string, string | number>;
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
