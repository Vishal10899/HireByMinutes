import { useEffect } from 'react';

export interface PageSEOProps {
  title?: string;
  description?: string;
  canonicalPath?: string;
  noindex?: boolean;
  ogType?: string;
}

const DEFAULT_TITLE = 'HireByMinute — Hire Experts by the Minute';
const DEFAULT_DESC = 'Find the right expert and hire them by the minute. Get real-time help from skilled professionals and pay only for the time you need.';
const BASE_CANONICAL = 'https://hirebyminute.com';

function setMetaTag(name: string, content: string, isProperty = false) {
  const selector = isProperty ? `meta[property="${name}"]` : `meta[name="${name}"]`;
  let tag = document.querySelector<HTMLMetaElement>(selector);
  if (!tag) {
    tag = document.createElement('meta');
    if (isProperty) {
      tag.setAttribute('property', name);
    } else {
      tag.setAttribute('name', name);
    }
    document.head.appendChild(tag);
  }
  tag.content = content;
}

function setCanonical(url: string) {
  let link = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!link) {
    link = document.createElement('link');
    link.rel = 'canonical';
    document.head.appendChild(link);
  }
  link.href = url;
}

export function usePageSEO({
  title = DEFAULT_TITLE,
  description = DEFAULT_DESC,
  canonicalPath = '/',
  noindex = false,
  ogType = 'website'
}: PageSEOProps = {}) {
  useEffect(() => {
    // 1. Document Title
    document.title = title;

    // 2. Canonical URL (strictly https://hirebyminute.com/...)
    const cleanPath = canonicalPath.startsWith('/') ? canonicalPath : `/${canonicalPath}`;
    const canonicalUrl = cleanPath === '/' ? `${BASE_CANONICAL}/` : `${BASE_CANONICAL}${cleanPath}`;
    setCanonical(canonicalUrl);

    // 3. Meta Description
    setMetaTag('description', description);

    // 4. Robots Directives
    const robotsValue = noindex
      ? 'noindex, nofollow, noarchive'
      : 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1';
    setMetaTag('robots', robotsValue);
    setMetaTag('googlebot', robotsValue);

    // 5. Open Graph tags
    setMetaTag('og:title', title, true);
    setMetaTag('og:description', description, true);
    setMetaTag('og:url', canonicalUrl, true);
    setMetaTag('og:type', ogType, true);

    // 6. Twitter tags
    setMetaTag('twitter:title', title);
    setMetaTag('twitter:description', description);
    setMetaTag('twitter:url', canonicalUrl);
  }, [title, description, canonicalPath, noindex, ogType]);
}

export default usePageSEO;
