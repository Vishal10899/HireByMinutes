import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api';
import { usePageSEO } from '../hooks/usePageSEO';
import {
  HelpCircle,
  Search,
  ChevronDown,
  Mail,
  ArrowRight,
  ShieldCheck,
  Clock,
  Sparkles,
  Layers,
  PhoneCall
} from 'lucide-react';

interface FaqItem {
  id: string;
  question: string;
  answer: string;
  category: string;
  sort_order: number;
  is_published: number | boolean;
}

export const FaqPage: React.FC = () => {
  usePageSEO({
    title: 'Frequently Asked Questions (FAQ) — HireByMinute',
    description: 'Find answers to frequently asked questions about hiring experts by the minute, video consultations, transparent billing, and expert payouts on HireByMinute.',
    canonicalPath: '/faq'
  });

  const [faqs, setFaqs] = useState<FaqItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [openItems, setOpenItems] = useState<Record<string, boolean>>({});

  useEffect(() => {
    async function fetchFaqs() {
      try {
        setLoading(true);
        const res = await api.getFaqs();
        const loadedFaqs = res.faqs || [];
        setFaqs(loadedFaqs);
        // Open the first 2 FAQs by default
        if (loadedFaqs.length > 0) {
          setOpenItems({
            [loadedFaqs[0].id]: true,
            ...(loadedFaqs[1] ? { [loadedFaqs[1].id]: true } : {})
          });
        }
      } catch (err) {
        console.error('Failed to load FAQs:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchFaqs();
  }, []);

  const categories = useMemo(() => {
    const cats = new Set<string>();
    faqs.forEach(f => {
      if (f.category) cats.add(f.category);
    });
    return Array.from(cats);
  }, [faqs]);

  const filteredFaqs = useMemo(() => {
    return faqs.filter(faq => {
      const matchesCategory = selectedCategory === 'all' || faq.category === selectedCategory;
      const matchesSearch =
        searchQuery.trim() === '' ||
        faq.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
        faq.answer.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesCategory && matchesSearch;
    });
  }, [faqs, selectedCategory, searchQuery]);

  const toggleItem = (id: string) => {
    setOpenItems(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  // Structured Data (JSON-LD) for SEO Rich Snippets
  const faqSchema = useMemo(() => {
    if (faqs.length === 0) return null;
    return {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      'mainEntity': faqs.map(faq => ({
        '@type': 'Question',
        'name': faq.question,
        'acceptedAnswer': {
          '@type': 'Answer',
          'text': faq.answer
        }
      }))
    };
  }, [faqs]);

  return (
    <div className="min-h-screen bg-aliceblue text-midnight py-12 px-4 sm:px-6 lg:px-8">
      {faqSchema && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
        />
      )}

      <div className="max-w-4xl mx-auto space-y-10">
        
        {/* Header Hero */}
        <div className="text-center space-y-4">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-moonstone/10 border border-moonstone/30 text-moonstone-dark text-xs font-bold">
            <HelpCircle className="w-3.5 h-3.5 text-moonstone" />
            <span>Knowledge Base & Support</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-midnight tracking-tight">
            Frequently Asked Questions
          </h1>
          <p className="text-sm sm:text-base text-midnight/70 max-w-2xl mx-auto leading-relaxed">
            Everything you need to know about hiring experts by the minute, real-time video consultations, transparent per-minute rates, and escrow-backed payouts.
          </p>
        </div>

        {/* Search & Category Filter Bar */}
        <div className="space-y-4">
          <div className="relative max-w-2xl mx-auto">
            <Search className="w-4 h-4 text-midnight/40 absolute left-4 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search answers (e.g., billing, video sessions, payouts)..."
              className="w-full pl-11 pr-4 py-3 bg-white rounded-2xl border border-timberwolf/70 text-sm text-midnight placeholder:text-midnight/40 focus:outline-none focus:border-moonstone shadow-card"
            />
          </div>

          {categories.length > 0 && (
            <div className="flex items-center justify-center flex-wrap gap-2 pt-2">
              <button
                onClick={() => setSelectedCategory('all')}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                  selectedCategory === 'all'
                    ? 'bg-midnight text-white shadow-subtle'
                    : 'bg-white text-midnight/70 border border-timberwolf/60 hover:bg-aliceblue'
                }`}
              >
                All Topics ({faqs.length})
              </button>
              {categories.map(cat => {
                const count = faqs.filter(f => f.category === cat).length;
                return (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                      selectedCategory === cat
                        ? 'bg-midnight text-white shadow-subtle'
                        : 'bg-white text-midnight/70 border border-timberwolf/60 hover:bg-aliceblue'
                    }`}
                  >
                    {cat} ({count})
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* FAQ Accordion List */}
        <div className="space-y-3">
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map(i => (
                <div key={i} className="h-16 bg-white rounded-2xl border border-timberwolf/40 animate-pulse" />
              ))}
            </div>
          ) : filteredFaqs.length === 0 ? (
            <div className="bg-white rounded-2xl border border-timberwolf/70 p-12 text-center space-y-3 shadow-card">
              <HelpCircle className="w-10 h-10 text-midnight/30 mx-auto" />
              <h3 className="text-base font-bold text-midnight">No questions found</h3>
              <p className="text-xs text-midnight/60 max-w-sm mx-auto">
                {searchQuery
                  ? `No FAQs matched your search for "${searchQuery}". Try different keywords or browse all categories.`
                  : 'No questions have been published in this category yet.'}
              </p>
              {searchQuery && (
                <button
                  onClick={() => {
                    setSearchQuery('');
                    setSelectedCategory('all');
                  }}
                  className="mt-2 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-midnight text-aliceblue text-xs font-semibold hover:bg-midnight-hover transition-colors cursor-pointer"
                >
                  Clear Search
                </button>
              )}
            </div>
          ) : (
            filteredFaqs.map(faq => {
              const isOpen = Boolean(openItems[faq.id]);
              return (
                <div
                  key={faq.id}
                  className="bg-white rounded-2xl border border-timberwolf/70 overflow-hidden shadow-card transition-all duration-200"
                >
                  <button
                    onClick={() => toggleItem(faq.id)}
                    className="w-full flex items-center justify-between p-5 text-left transition-colors hover:bg-aliceblue/40 cursor-pointer"
                    aria-expanded={isOpen}
                  >
                    <div className="flex items-center gap-3 pr-4">
                      <span className="w-2 h-2 rounded-full bg-moonstone shrink-0" />
                      <span className="text-sm sm:text-base font-bold text-midnight">
                        {faq.question}
                      </span>
                    </div>
                    <ChevronDown
                      className={`w-4 h-4 text-midnight/50 shrink-0 transition-transform duration-200 ${
                        isOpen ? 'rotate-180 text-moonstone' : ''
                      }`}
                    />
                  </button>

                  {isOpen && (
                    <div className="px-5 pb-5 pt-1 text-xs sm:text-sm text-midnight/80 leading-relaxed border-t border-timberwolf/20 space-y-3 bg-aliceblue/10">
                      <p className="whitespace-pre-line">{faq.answer}</p>
                      {faq.category && (
                        <div className="pt-2">
                          <span className="text-[10px] uppercase font-bold text-midnight/40 px-2 py-0.5 rounded-md bg-timberwolf/20">
                            {faq.category}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Contact Support Banner */}
        <div className="bg-gradient-to-r from-midnight to-midnight-hover text-white rounded-2xl p-6 sm:p-8 shadow-card flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="space-y-1 text-center sm:text-left">
            <h3 className="text-lg font-extrabold text-aliceblue">Still have a question?</h3>
            <p className="text-xs text-aliceblue/70 max-w-md">
              Can't find the answer you're looking for? Our dedicated team is available to assist you with any inquiries or platform support.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              to="/contact"
              className="btn-shine inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-moonstone text-white font-semibold text-xs hover:bg-moonstone-dark transition-all shadow-subtle cursor-pointer"
            >
              <Mail className="w-3.5 h-3.5" />
              <span>Contact Support</span>
              <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
        </div>

      </div>
    </div>
  );
};

export default FaqPage;
