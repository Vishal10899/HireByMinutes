import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../services/api';
import { FileText, ArrowLeft, Clock, ShieldCheck, HelpCircle } from 'lucide-react';
import { usePageSEO } from '../hooks/usePageSEO';

interface CmsPageData {
  id: string;
  slug: string;
  title: string;
  meta_title?: string;
  meta_description?: string;
  content: string;
  status: 'published' | 'draft';
  updated_at: string;
}

interface DynamicCmsPageProps {
  fixedSlug?: string;
  fallbackTitle?: string;
  fallbackContent?: React.ReactNode;
}

export const DynamicCmsPage: React.FC<DynamicCmsPageProps> = ({
  fixedSlug,
  fallbackTitle,
  fallbackContent
}) => {
  const params = useParams<{ slug: string }>();
  const slug = fixedSlug || params.slug || '';

  const [page, setPage] = useState<CmsPageData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  usePageSEO({
    title: page ? (page.meta_title || `${page.title} — HireByMinute`) : fallbackTitle ? `${fallbackTitle} — HireByMinute` : 'HireByMinute',
    description: page?.meta_description || 'View information and platform policies on HireByMinute.',
    canonicalPath: `/p/${slug}`
  });

  useEffect(() => {
    if (!slug) {
      setLoading(false);
      return;
    }

    let mounted = true;
    setLoading(true);
    setError(null);

    api
      .getPublicCmsPage(slug)
      .then((res) => {
        if (mounted) {
          if (res?.page) {
            setPage(res.page);
            document.title = res.page.meta_title || `${res.page.title} — HireByMinute`;
          } else {
            setPage(null);
          }
        }
      })
      .catch((err) => {
        if (mounted) {
          console.debug('[DynamicCmsPage] Fetch error:', err);
          setError('Failed to load page');
        }
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [slug]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [slug]);

  if (loading) {
    return (
      <div className="min-h-[60vh] bg-aliceblue flex items-center justify-center py-16 px-4">
        <div className="flex flex-col items-center gap-3 text-midnight/60">
          <div className="w-8 h-8 rounded-full border-2 border-moonstone border-t-transparent animate-spin" />
          <span className="text-xs font-semibold">Loading content...</span>
        </div>
      </div>
    );
  }

  // If page not found and fallbackContent provided, render fallback
  if (!page && fallbackContent) {
    return <>{fallbackContent}</>;
  }

  // If not found and no fallback
  if (!page) {
    return (
      <div className="min-h-[60vh] bg-aliceblue flex items-center justify-center py-16 px-4">
        <div className="bg-white rounded-2xl border border-timberwolf/70 p-8 max-w-md w-full text-center space-y-4 shadow-card">
          <div className="w-12 h-12 rounded-2xl bg-aliceblue text-moonstone flex items-center justify-center mx-auto border border-timberwolf/50">
            <HelpCircle className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-bold text-midnight">Page Not Found</h2>
          <p className="text-xs text-midnight/70 leading-relaxed">
            The page you are looking for may have been moved, unpublished, or does not exist.
          </p>
          <div className="pt-2">
            <Link
              to="/services"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-midnight text-aliceblue text-xs font-semibold hover:bg-midnight-hover transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Explore Marketplace</span>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Render markdown-like plain formatted text
  const renderFormattedContent = (raw: string) => {
    return raw.split('\n\n').map((block, idx) => {
      const trimmed = block.trim();
      if (!trimmed) return null;

      // Heading 1 (# ...)
      if (trimmed.startsWith('# ')) {
        return (
          <h1 key={idx} className="text-2xl sm:text-3xl font-extrabold text-midnight tracking-tight mt-6 mb-3">
            {trimmed.slice(2)}
          </h1>
        );
      }

      // Heading 2 (## ...)
      if (trimmed.startsWith('## ')) {
        return (
          <h2 key={idx} className="text-xl sm:text-2xl font-bold text-midnight tracking-tight mt-6 mb-2.5">
            {trimmed.slice(3)}
          </h2>
        );
      }

      // Heading 3 (### ...)
      if (trimmed.startsWith('### ')) {
        return (
          <h3 key={idx} className="text-base sm:text-lg font-bold text-midnight mt-4 mb-2">
            {trimmed.slice(4)}
          </h3>
        );
      }

      // Bullet list items (- ...)
      if (trimmed.includes('\n- ') || trimmed.startsWith('- ')) {
        const items = trimmed.split('\n').filter((l) => l.trim().startsWith('- '));
        return (
          <ul key={idx} className="space-y-1.5 pl-4 list-disc list-outside text-midnight/80 my-3">
            {items.map((item, itemIdx) => (
              <li key={itemIdx} className="leading-relaxed">
                {item.replace(/^- /, '')}
              </li>
            ))}
          </ul>
        );
      }

      // Standard Paragraph
      return (
        <p key={idx} className="leading-relaxed text-midnight/80 my-3">
          {trimmed}
        </p>
      );
    });
  };

  return (
    <div className="min-h-screen bg-aliceblue text-midnight py-10 sm:py-14">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
        {/* Navigation Breadcrumb */}
        <div className="flex items-center gap-2 text-xs text-midnight/60">
          <Link to="/" className="hover:text-moonstone transition-colors">Home</Link>
          <span>/</span>
          <span className="font-semibold text-midnight truncate">{page.title}</span>
        </div>

        {/* Header Hero */}
        <div className="space-y-3 border-b border-timberwolf/60 pb-6">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-moonstone/10 text-moonstone-dark text-xs font-bold border border-moonstone/30">
            <FileText className="w-3.5 h-3.5 text-moonstone" />
            <span>Official Policy & Terms</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-midnight">
            {page.title}
          </h1>
          {page.meta_description && (
            <p className="text-xs sm:text-sm text-midnight/70 leading-relaxed max-w-2xl">
              {page.meta_description}
            </p>
          )}
          {page.updated_at && (
            <div className="text-xs text-midnight/50 flex items-center gap-1.5 pt-1">
              <Clock className="w-3.5 h-3.5" />
              <span>Last Modified: {new Date(page.updated_at).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}</span>
            </div>
          )}
        </div>

        {/* Content Card */}
        <div className="bg-white rounded-2xl border border-timberwolf/70 p-6 sm:p-10 shadow-card text-xs sm:text-sm leading-relaxed space-y-4">
          {renderFormattedContent(page.content)}
        </div>
      </div>
    </div>
  );
};
export default DynamicCmsPage;
