import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { usePageSEO } from '../hooks/usePageSEO';
import {
  Clock,
  Calendar,
  User,
  ArrowLeft,
  ArrowRight,
  Share2,
  CheckCircle,
  Sparkles,
  BookOpen,
  ChevronRight,
  MessageSquare
} from 'lucide-react';

interface BlogPostDetail {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  author_name: string;
  category: string;
  featured_image?: string;
  read_time_minutes: number;
  views_count: number;
  meta_title?: string;
  meta_description?: string;
  canonical_url?: string;
  published_at: string;
  tags?: string[];
}

export const BlogPostPage: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();

  const [post, setPost] = useState<BlogPostDetail | null>(null);
  const [related, setRelated] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<boolean>(false);

  usePageSEO({
    title: post ? `${post.meta_title || post.title} — HireByMinute` : 'Expert Advisory Guide — HireByMinute',
    description: post?.meta_description || post?.excerpt || 'Actionable 1-on-1 expert consultation insights and architectural guidance.',
    canonicalPath: `/blog/${slug || ''}`,
    ogType: 'article'
  });

  useEffect(() => {
    async function loadPost() {
      if (!slug) return;
      try {
        setLoading(true);
        setError(null);
        const data = await api.getBlogPost(slug);
        setPost(data.post);
        setRelated(data.related || []);
      } catch (err: any) {
        setError(err.message || 'Article not found');
      } finally {
        setLoading(false);
      }
    }

    loadPost();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [slug]);

  // Inject JSON-LD Schema.org Article Structured Data
  useEffect(() => {
    if (!post) return;
    const scriptId = 'json-ld-article-schema';
    let script = document.getElementById(scriptId) as HTMLScriptElement | null;
    if (!script) {
      script = document.createElement('script');
      script.id = scriptId;
      script.type = 'application/ld+json';
      document.head.appendChild(script);
    }

    const schema = {
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: post.title,
      description: post.excerpt,
      author: {
        '@type': 'Person',
        name: post.author_name
      },
      publisher: {
        '@type': 'Organization',
        name: 'HireByMinute',
        url: 'https://hirebyminute.com',
        logo: {
          '@type': 'ImageObject',
          url: 'https://hirebyminute.com/favicon.svg'
        }
      },
      datePublished: post.published_at || new Date().toISOString(),
      mainEntityOfPage: {
        '@type': 'WebPage',
        '@id': `https://hirebyminute.com/blog/${post.slug}`
      }
    };

    script.textContent = JSON.stringify(schema);

    return () => {
      const el = document.getElementById(scriptId);
      if (el) el.remove();
    };
  }, [post]);

  const handleShare = () => {
    if (navigator.share) {
      navigator.share({
        title: post?.title,
        url: window.location.href
      }).catch(() => {});
    } else {
      navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // Simple Markdown renderer
  const renderMarkdown = (text: string) => {
    const lines = text.split('\n');
    const elements: React.ReactNode[] = [];

    lines.forEach((line, index) => {
      const trimmed = line.trim();

      if (trimmed.startsWith('# ')) {
        elements.push(
          <h1 key={index} className="text-2xl sm:text-3xl font-extrabold text-midnight mt-8 mb-4">
            {trimmed.replace('# ', '')}
          </h1>
        );
      } else if (trimmed.startsWith('## ')) {
        elements.push(
          <h2 key={index} className="text-xl sm:text-2xl font-bold text-midnight mt-6 mb-3 border-b border-timberwolf/40 pb-2">
            {trimmed.replace('## ', '')}
          </h2>
        );
      } else if (trimmed.startsWith('### ')) {
        elements.push(
          <h3 key={index} className="text-lg sm:text-xl font-bold text-midnight mt-5 mb-2">
            {trimmed.replace('### ', '')}
          </h3>
        );
      } else if (trimmed.startsWith('> ')) {
        elements.push(
          <blockquote key={index} className="border-l-4 border-moonstone bg-aliceblue/60 p-4 rounded-r-xl italic text-midnight/80 my-4 text-sm">
            {trimmed.replace('> ', '')}
          </blockquote>
        );
      } else if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
        elements.push(
          <li key={index} className="text-sm text-midnight/80 ml-5 list-disc leading-relaxed my-1">
            {trimmed.replace(/^[-*]\s+/, '')}
          </li>
        );
      } else if (trimmed === '---') {
        elements.push(<hr key={index} className="my-8 border-timberwolf/50" />);
      } else if (trimmed.length > 0) {
        elements.push(
          <p key={index} className="text-sm sm:text-base text-midnight/80 leading-relaxed my-3">
            {trimmed}
          </p>
        );
      }
    });

    return elements;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-aliceblue py-20 text-center">
        <div className="w-10 h-10 border-2 border-moonstone border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-xs text-midnight/60 font-medium">Loading article...</p>
      </div>
    );
  }

  if (error || !post) {
    return (
      <div className="min-h-screen bg-aliceblue py-20 px-4">
        <div className="max-w-md mx-auto bg-white rounded-2xl border border-timberwolf/70 p-8 text-center space-y-4 shadow-subtle">
          <BookOpen className="w-10 h-10 text-timberwolf-dark mx-auto" />
          <h2 className="text-lg font-bold text-midnight">Article Not Found</h2>
          <p className="text-xs text-midnight/60">
            The article you are looking for may have been archived, unlisted, or moved.
          </p>
          <Link
            to="/blog"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-midnight text-aliceblue text-xs font-semibold hover:bg-midnight-hover"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Return to Blog</span>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full min-h-screen bg-aliceblue py-8 sm:py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto space-y-8">
        
        {/* Breadcrumb Navigation */}
        <nav className="flex items-center gap-2 text-xs text-midnight/60">
          <Link to="/" className="hover:text-midnight transition-colors">Home</Link>
          <ChevronRight className="w-3.5 h-3.5 text-midnight/40" />
          <Link to="/blog" className="hover:text-midnight transition-colors">Blog</Link>
          <ChevronRight className="w-3.5 h-3.5 text-midnight/40" />
          <span className="text-midnight font-semibold truncate max-w-[200px] sm:max-w-sm">
            {post.category}
          </span>
        </nav>

        {/* Article Container */}
        <article className="bg-white rounded-3xl border border-timberwolf/70 p-6 sm:p-10 lg:p-12 shadow-subtle space-y-8">
          
          {/* Article Header */}
          <header className="space-y-4 border-b border-timberwolf/40 pb-6">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <span className="px-3 py-1 rounded-full bg-aliceblue text-moonstone font-bold text-xs uppercase tracking-wider border border-lightblue/60">
                {post.category}
              </span>
              <button
                type="button"
                onClick={handleShare}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-timberwolf/60 text-midnight/70 hover:text-midnight hover:bg-aliceblue text-xs font-semibold transition-all cursor-pointer"
              >
                <Share2 className="w-3.5 h-3.5 text-moonstone" />
                <span>{copied ? 'Link Copied!' : 'Share'}</span>
              </button>
            </div>

            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-midnight tracking-tight leading-tight">
              {post.title}
            </h1>

            <p className="text-sm sm:text-base text-midnight/70 font-medium leading-relaxed">
              {post.excerpt}
            </p>

            {/* Author and Metadata Bar */}
            <div className="flex items-center justify-between text-xs text-midnight/60 pt-2 flex-wrap gap-3">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-aliceblue border border-lightblue flex items-center justify-center text-midnight font-bold">
                  {post.author_name.charAt(0)}
                </div>
                <div>
                  <span className="font-bold text-midnight block">{post.author_name}</span>
                  <span className="text-[11px] text-midnight/50">Verified Contributor</span>
                </div>
              </div>

              <div className="flex items-center gap-4 text-[11px] text-midnight/60">
                <span className="flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5" />
                  {post.published_at ? new Date(post.published_at).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) : 'Recently'}
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" />
                  {post.read_time_minutes} min read
                </span>
              </div>
            </div>
          </header>

          {/* Article Main Body */}
          <div className="prose prose-midnight max-w-none">
            {renderMarkdown(post.content)}
          </div>

          {/* Contextual In-Article CTA Banner */}
          <div className="bg-aliceblue rounded-2xl border border-lightblue/80 p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="space-y-1 text-center sm:text-left">
              <h4 className="text-sm font-bold text-midnight">Need 1-on-1 advice on this topic?</h4>
              <p className="text-xs text-midnight/70">
                Skip the guesswork. Book a 15, 30, or 60 minute live consultation with a domain specialist.
              </p>
            </div>
            <Link
              to="/services"
              className="px-4 py-2.5 rounded-xl bg-midnight text-aliceblue text-xs font-bold hover:bg-midnight-hover transition-all whitespace-nowrap shadow-subtle shrink-0"
            >
              Browse Experts in {post.category} →
            </Link>
          </div>

        </article>

        {/* Related Articles */}
        {related.length > 0 && (
          <section className="space-y-4 pt-4">
            <h3 className="text-lg font-bold text-midnight">Related Articles</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {related.map((rel) => (
                <Link
                  key={rel.id}
                  to={`/blog/${rel.slug}`}
                  className="bg-white rounded-2xl border border-timberwolf/70 p-5 shadow-subtle hover:shadow-card hover:border-moonstone/60 transition-all flex flex-col justify-between group"
                >
                  <div className="space-y-2">
                    <span className="text-[10px] font-bold text-moonstone uppercase tracking-wider block">
                      {rel.category}
                    </span>
                    <h4 className="text-sm font-bold text-midnight group-hover:text-moonstone transition-colors line-clamp-2">
                      {rel.title}
                    </h4>
                    <p className="text-xs text-midnight/60 line-clamp-2">
                      {rel.excerpt}
                    </p>
                  </div>
                  <div className="pt-3 mt-3 border-t border-timberwolf/30 flex items-center justify-between text-[11px] text-midnight/50">
                    <span>{rel.read_time_minutes} min read</span>
                    <span className="font-semibold text-moonstone flex items-center gap-0.5">
                      Read <ArrowRight className="w-3 h-3" />
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Back to Blog Button */}
        <div className="pt-4 text-center">
          <Link
            to="/blog"
            className="inline-flex items-center gap-2 text-xs font-bold text-midnight/70 hover:text-midnight transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to All Articles</span>
          </Link>
        </div>

      </div>
    </div>
  );
};
