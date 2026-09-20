import blockedTerms from '@server/content/blocked-terms.json';

const removableCharacters = /[\p{Cc}\p{Cf}\p{P}\p{S}\p{Z}]/gu;

// 词库中少量普通仙侠用语会误伤正常游戏文本。微信内容安全仍会结合
// 上下文复核微信用户输入；本地匹配器只排除已由现网样本确认的中性词。
const domainAllowlist = new Set([
  '镇压',
  '触手',
  '父母双亡',
  '无父无母',
  '无父母',
  '真实身份',
  '天道盟',
  '杀戮',
  '杀神',
  '中枢系统',
  '叉叉',
]);

export function normalizeContentForModeration(value: string): string {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase('zh-CN')
    .replace(removableCharacters, '');
}

function buildIndex(terms: readonly string[]) {
  const normalizedTerms = new Set(
    terms
      .map(normalizeContentForModeration)
      .filter((term) => term.length > 0 && !domainAllowlist.has(term)),
  );
  const exactOnlyTerms = new Set<string>();
  const termsByPrefix = new Map<string, string[]>();

  for (const term of normalizedTerms) {
    const characters = Array.from(term);
    if (
      characters.length <= 2 ||
      (/^[a-z0-9]+$/u.test(term) && characters.length <= 4)
    ) {
      exactOnlyTerms.add(term);
      continue;
    }
    const prefix = `${characters[0]}${characters[1]}`;
    const group = termsByPrefix.get(prefix);
    if (group) group.push(term);
    else termsByPrefix.set(prefix, [term]);
  }

  for (const group of termsByPrefix.values()) {
    group.sort((left, right) => right.length - left.length);
  }

  return {
    exactOnlyTerms,
    termsByPrefix,
    termCount: normalizedTerms.size,
  };
}

const index = buildIndex(blockedTerms);

export type LocalContentViolation = {
  normalizedContent: string;
  matchedTerm: string;
};

export function findLocalContentViolation(
  content: string,
): LocalContentViolation | null {
  const normalizedContent = normalizeContentForModeration(content);
  if (!normalizedContent) return null;

  if (index.exactOnlyTerms.has(normalizedContent)) {
    return { normalizedContent, matchedTerm: normalizedContent };
  }

  const characters = Array.from(normalizedContent);
  let codeUnitOffset = 0;
  for (
    let characterIndex = 0;
    characterIndex < characters.length - 1;
    characterIndex += 1
  ) {
    const prefix = `${characters[characterIndex]}${characters[characterIndex + 1]}`;
    const candidates = index.termsByPrefix.get(prefix);
    if (candidates) {
      const matchedTerm = candidates.find((term) =>
        normalizedContent.startsWith(term, codeUnitOffset),
      );
      if (matchedTerm) return { normalizedContent, matchedTerm };
    }
    codeUnitOffset += characters[characterIndex]!.length;
  }

  return null;
}

export function getLocalBlocklistStats() {
  return {
    termCount: index.termCount,
    prefixCount: index.termsByPrefix.size,
    exactOnlyTermCount: index.exactOnlyTerms.size,
  };
}
