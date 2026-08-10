import { OfficialWebsiteView } from '@app/components/official/OfficialWebsiteView';
import {
  DEFAULT_WEBSITE_CONTENT,
  WebsiteContentSchema,
  type WebsiteContent,
} from '@shared/config/websiteContent';
import { useEffect, useState } from 'react';

function applySeo(content: WebsiteContent) {
  document.title = content.seo.title;
  let description = document.querySelector<HTMLMetaElement>(
    'meta[name="description"]',
  );
  if (!description) {
    description = document.createElement('meta');
    description.name = 'description';
    document.head.appendChild(description);
  }
  description.content = content.seo.description;

  let keywords = document.querySelector<HTMLMetaElement>('meta[name="keywords"]');
  if (!keywords) {
    keywords = document.createElement('meta');
    keywords.name = 'keywords';
    document.head.appendChild(keywords);
  }
  keywords.content = content.seo.keywords;
}

export default function OfficialWebsitePage() {
  const [content, setContent] = useState<WebsiteContent>(DEFAULT_WEBSITE_CONTENT);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch('/api/website-content', {
          cache: 'no-store',
        });
        const payload = (await response.json()) as { content?: unknown };
        const parsed = WebsiteContentSchema.safeParse(payload.content);
        if (!cancelled && response.ok && parsed.success) {
          setContent(parsed.data);
        }
      } catch {
        // Bundled defaults intentionally keep the public site available.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    applySeo(content);
  }, [content]);

  return <OfficialWebsiteView content={content} />;
}
