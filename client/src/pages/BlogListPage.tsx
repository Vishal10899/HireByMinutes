import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api';
import { usePageSEO } from '../hooks/usePageSEO';
import { BookOpen, Clock, Calendar, ArrowRight, Search, Tag, Sparkles } from 'lucide-react';

interface BlogPostSummary {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  author_name: string;
  category: string;
  featured_image?: string;
  read_time_minutes: number;
  views_count: number;
  published_at: string;
}

export const BlogListPage: React.FC = () => {
  usePageSEO({
    title: 'Expert Insights, Architecture Guides & Minute Advisory — HireByMinute Blog',
    description: 'Practical guides and tactical insights on precision 1-on-1 consultations, cloud architectures, system design, and on-demand professional expertise.',
    canonicalPath: '/blog'
  });

  const [posts, setPosts] = useState<BlogPostSummary[]>([]);
  const [categories, setCategories] = useState<{ name: string; post_count: number }[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        setError(null);
        const [postsRes, catRes] = await Promise.all([
          api.getBlogPosts({
            category: selectedCategory === 'All' ? undefined : selectedCategory,
            search: searchQuery.trim() || undefined,
            limit: 24
          }),
          api.getBlogCategories().catch(() => ({ categories: [] }))
        ]);
        setPosts(postsRes.posts || []);
        setCategories(catRes.categories || []);
      } catch (err: any) {
        setError(err.message || 'Failed to load blog posts.');
      } finally {
        setLoading(false);
      }
    }

    const timer = setTimeout(loadData, 200);
    return () => clearTimeout(timer);
  }, [selectedCategory, searchQuery]);

  return (
    <div className="w-full min-h-screen bg-aliceblue py-10 sm:py-14 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto space-y-10">
        
        {/* Header Hero */}
        <div className="text-center space-y-4 max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-lightblue/40 text-midnight text-xs font-bold border border-lightblue">
            <Sparkles className="w-3.5 h-3.5 text-moonstone" />
            <span>Tactical Guidance & Advisory Insights</span>
          </div>
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-midnight tracking-tight leading-tight">
            The HireByMinute Blog
          </h1>
          <p className="text-sm sm:text-base text-midnight/70 leading-relaxed font-normal">
            Actionable perspectives on 1-on-1 expert consulting, system architecture, startup legal strategy, and getting maximum return on your consultation minutes.
          </p>
        </div>

        {/* Search & Category Filter */}
        <div className="bg-white rounded-2xl border border-timberwolf/70 p-4 sm:p-6 shadow-subtle space-y-4">
          <div className="relative">
            <Search className="w-4 h-4 text-midnight/40 absolute left-4 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search guides by topic, technology, or question..."
              className="w-full pl-11 pr-4 py-3 bg-aliceblue/30 border border-timberwolf/60 rounded-xl text-sm text-midnight placeholder:text-midnight/40 focus:outline-none focus:border-moonstone transition-colors"
            />
          </div>

          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
            <button
              type="button"
              onClick={() => setSelectedCategory('All')}
              className={`px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                selectedCategory === 'All'
                  ? 'bg-midnight text-aliceblue shadow-subtle'
                  : 'bg-aliceblue/60 text-midnight/70 hover:bg-aliceblue hover:text-midnight'
              }`}
            >
              All Articles
            </button>
            {categories.map((cat) => (
              <button
                key={cat.name}
                type="button"
                onClick={() => setSelectedCategory(cat.name)}
                className={`px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                  selectedCategory === cat.name
                    ? 'bg-midnight text-aliceblue shadow-subtle'
                    : 'bg-aliceblue/60 text-midnight/70 hover:bg-aliceblue hover:text-midnight'
                }`}
              >
                {cat.name} ({cat.post_count})
              </button>
            ))}
          </div>
        </div>

        {/* Posts Grid */}
        {loading ? (
          <div className="text-center py-20">
            <div className="w-10 h-10 border-2 border-moonstone border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-xs text-midnight/60 font-medium">Loading published articles...</p>
          </div>
        ) : error ? (
          <div className="bg-rose-50 border border-rose-200 rounded-2xl p-6 text-center text-rose-800 text-sm">
            {error}
          </div>
        ) : posts.length === 0 ? (
          <div className="bg-white rounded-2xl border border-timberwolf/70 p-12 text-center space-y-3 shadow-subtle">
            <BookOpen className="w-12 h-12 text-timberwolf-dark mx-auto" />
            <h3 className="text-base font-bold text-midnight">No articles matched your criteria</h3>
            <p className="text-xs text-midnight/60 max-w-md mx-auto">
              Try searching for different keywords or select a different category filter.
            </p>
            <button
              onClick={() => { setSelectedCategory('All'); setSearchQuery(''); }}
              className="text-xs font-bold text-moonstone hover:underline cursor-pointer"
            >
              Reset filters
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {posts.map((post) => (
              <article
                key={post.id}
                className="bg-white rounded-2xl border border-timberwolf/70 overflow-hidden shadow-subtle hover:shadow-card transition-all flex flex-col justify-between group hover:border-moonstone/60"
              >
                <div className="p-6 space-y-3.5">
                  <div className="flex items-center justify-between text-xs text-midnight/60 gap-2">
                    <span className="font-bold text-moonstone uppercase tracking-wider text-[11px] bg-aliceblue px-2.5 py-0.5 rounded-full border border-lightblue/60">
                      {post.category}
                    </span>
                    <span className="flex items-center gap-1 text-[11px]">
                      <Clock className="w-3 h-3" />
                      {post.read_time_minutes} min read
                    </span>
                  </div>

                  <Link to={`/blog/${post.slug}`} className="block group-hover:text-moonstone transition-colors">
                    <h2 className="text-lg font-bold text-midnight leading-snug line-clamp-2">
                      {post.title}
                    </h2>
                  </Link>

                  <p className="text-xs text-midnight/70 leading-relaxed line-clamp-3">
                    {post.excerpt}
                  </p>
                </div>

                <div className="px-6 py-4 border-t border-timberwolf/40 bg-aliceblue/20 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2 text-midnight/60 text-[11px]">
                    <Calendar className="w-3.5 h-3.5 text-midnight/40" />
                    <span>
                      {post.published_at ? new Date(post.published_at).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) : 'Recently'}
                    </span>
                  </div>

                  <Link
                    to={`/blog/${post.slug}`}
                    className="inline-flex items-center gap-1 font-bold text-midnight group-hover:text-moonstone transition-colors"
                  >
                    <span>Read Guide</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </article>
            ))}
          </div>
        )}

        {/* Bottom Callout: Find an Expert */}
        <div className="bg-midnight rounded-3xl p-8 sm:p-10 text-aliceblue shadow-card flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="space-y-2 text-center md:text-left">
            <h3 className="text-xl sm:text-2xl font-bold">Have a specific question about your project?</h3>
            <p className="text-xs sm:text-sm text-aliceblue/80 max-w-xl">
              Do not waste hours sifting through conflicting search results. Connect directly with a verified specialist for 15, 30, or 60 minutes.
            </p>
          </div>
          <Link
            to="/services"
            className="px-6 py-3 rounded-xl bg-moonstone text-white font-bold text-xs sm:text-sm hover:bg-moonstone-hover transition-all whitespace-nowrap shadow-subtle shrink-0"
          >
            Find a Verified Expert →
          </Link>
        </div>

      </div>
    </div>
  );
};
