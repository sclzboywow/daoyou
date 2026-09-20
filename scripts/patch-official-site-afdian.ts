import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const siteRoot = resolve(process.argv[2] || 'dist-site');
const creatorUrl = 'https://afdian.com/a/wanjiedaoyou';

const homepageSection = `<section id="afdian-support" class="section-padding scroll-mt-28 bg-paper-dark/20"><div class="mx-auto max-w-6xl"><div class="section-heading mb-12 text-center"><p class="page-eyebrow">CREATOR SUPPORT</p><h2 class="font-heading text-ink section-title-decorated mt-2 text-3xl md:text-4xl">爱发电 · 与万界同行</h2></div><div class="content-card mx-auto max-w-4xl p-6 md:p-8"><h3 class="text-ink text-2xl font-semibold">《万界道友》已入驻爱发电</h3><p class="text-ink-secondary mt-3 text-sm leading-7 md:text-base">如果你愿意支持《万界道友》的持续创作与维护，可以通过爱发电贡献功德。支持将用于服务器、AI 服务、对象存储、域名和后续开发；完全自愿，不会影响游戏数值、账号权益或项目决策。</p><div class="mt-6"><a href="${creatorUrl}" target="_blank" rel="me noopener noreferrer" class="cta-button">前往《万界道友》爱发电主页</a></div></div></div></section>`;

const supportSection = `<section id="afdian-support" class="scroll-mt-28"><div class="mb-8 border-b border-ink/10 pb-4"><p class="page-eyebrow">CREATOR SUPPORT</p><h2 class="font-heading text-ink mt-2 text-4xl">爱发电支持</h2></div><article class="content-card p-6 md:p-8"><h3 class="text-ink text-2xl font-semibold">《万界道友》已入驻爱发电</h3><p class="text-ink-secondary mt-3 text-sm leading-7 md:text-base">爱发电是项目当前公开的支持入口。支持用于服务器、AI 服务、对象存储、域名和持续开发，完全自愿，不影响游戏数值或账号权益。</p><div class="mt-6"><a href="${creatorUrl}" target="_blank" rel="me noopener noreferrer" class="cta-button">前往爱发电贡献功德</a></div></article></section>`;

const oldFreeAnswer =
  '当前《万界道友》以开源文字修仙项目形式推进，玩家可通过浏览器入口体验。若后续出现正式运营、赞助、活动或付费相关规则，会以官网公告为准。';
const newFreeAnswer =
  '《万界道友》保持免费与开源，玩家可通过浏览器入口体验。项目现已入驻爱发电，支持完全自愿，不影响游戏数值、账号权益或项目决策；相关规则以官网公告为准。';

function insertBeforeSectionContaining(
  html: string,
  heading: string,
  section: string,
): string {
  if (html.includes('id="afdian-support"')) return html;
  const headingIndex = html.indexOf(heading);
  if (headingIndex < 0) throw new Error(`找不到官网插入锚点：${heading}`);
  const sectionIndex = html.lastIndexOf('<section', headingIndex);
  if (sectionIndex < 0) throw new Error(`找不到 ${heading} 所在 section`);
  return `${html.slice(0, sectionIndex)}${section}${html.slice(sectionIndex)}`;
}

async function patchHomepage(): Promise<void> {
  const path = resolve(siteRoot, 'index.html');
  let html = await readFile(path, 'utf8');
  html = insertBeforeSectionContaining(html, '社区与开源', homepageSection);
  html = html.replace(
    'id="afdian-support" class="section-padding bg-paper-dark/20"',
    'id="afdian-support" class="section-padding scroll-mt-28 bg-paper-dark/20"',
  );
  html = html.replaceAll('class="btn-primary"', 'class="cta-button"');
  html = html.replaceAll(oldFreeAnswer, newFreeAnswer);
  await writeFile(path, html, 'utf8');
}

async function patchSupportPage(): Promise<void> {
  const path = resolve(siteRoot, 'support/index.html');
  let html = await readFile(path, 'utf8');
  if (!html.includes('id="afdian-support"')) {
    const faqIndex = html.indexOf('<section id="faq"');
    if (faqIndex < 0) throw new Error('找不到支持页 FAQ 插入锚点');
    html = `${html.slice(0, faqIndex)}${supportSection}${html.slice(faqIndex)}`;
  }
  html = html.replaceAll('class="btn-primary"', 'class="cta-button"');
  html = html.replaceAll(oldFreeAnswer, newFreeAnswer);
  await writeFile(path, html, 'utf8');
}

await Promise.all([patchHomepage(), patchSupportPage()]);
console.info(`[official-site] 已写入爱发电认证声明：${siteRoot}`);
