export interface CountryItem {
  code: string;
  name: string;
}

export const COUNTRIES: CountryItem[] = [
  { code: 'US', name: 'United States' },
  { code: 'IN', name: 'India' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'CA', name: 'Canada' },
  { code: 'AU', name: 'Australia' },
  { code: 'DE', name: 'Germany' },
  { code: 'FR', name: 'France' },
  { code: 'AE', name: 'United Arab Emirates' },
  { code: 'SG', name: 'Singapore' },
  { code: 'JP', name: 'Japan' },
  { code: 'NL', name: 'Netherlands' },
  { code: 'CH', name: 'Switzerland' },
  { code: 'SE', name: 'Sweden' },
  { code: 'ES', name: 'Spain' },
  { code: 'IT', name: 'Italy' },
  { code: 'BR', name: 'Brazil' },
  { code: 'MX', name: 'Mexico' },
  { code: 'KR', name: 'South Korea' },
  { code: 'ZA', name: 'South Africa' },
  { code: 'ID', name: 'Indonesia' },
  { code: 'PL', name: 'Poland' },
  { code: 'TR', name: 'Turkey' },
  { code: 'VN', name: 'Vietnam' },
  { code: 'TH', name: 'Thailand' },
  { code: 'IE', name: 'Ireland' },
  { code: 'NZ', name: 'New Zealand' },
  { code: 'IL', name: 'Israel' },
  { code: 'NO', name: 'Norway' },
  { code: 'DK', name: 'Denmark' },
  { code: 'FI', name: 'Finland' },
  { code: 'AT', name: 'Austria' },
  { code: 'BE', name: 'Belgium' },
  { code: 'PT', name: 'Portugal' },
  { code: 'PH', name: 'Philippines' },
  { code: 'MY', name: 'Malaysia' },
  { code: 'PK', name: 'Pakistan' },
  { code: 'BD', name: 'Bangladesh' },
  { code: 'NG', name: 'Nigeria' },
  { code: 'KE', name: 'Kenya' },
  { code: 'EG', name: 'Egypt' },
  { code: 'SA', name: 'Saudi Arabia' },
  { code: 'AR', name: 'Argentina' },
  { code: 'CL', name: 'Chile' },
  { code: 'CO', name: 'Colombia' }
];

export const LANGUAGES: string[] = [
  'English',
  'Hindi',
  'Spanish',
  'French',
  'German',
  'Mandarin Chinese',
  'Arabic',
  'Portuguese',
  'Bengali',
  'Russian',
  'Japanese',
  'Punjabi',
  'Marathi',
  'Telugu',
  'Tamil',
  'Gujarati',
  'Urdu',
  'Korean',
  'Italian',
  'Turkish',
  'Vietnamese',
  'Polish',
  'Dutch',
  'Thai',
  'Indonesian',
  'Malayalam',
  'Kannada',
  'Odia',
  'Persian',
  'Swahili',
  'Tagalog',
  'Hebrew',
  'Greek',
  'Swedish',
  'Norwegian',
  'Danish',
  'Finnish',
  'Czech',
  'Romanian',
  'Hungarian',
  'Ukrainian'
];

export const CATEGORY_SUBCATEGORIES: Record<string, string[]> = {
  'technology': [
    'Web Development',
    'Mobile Apps (iOS & Android)',
    'Backend & APIs',
    'DevOps & Cloud Architecture',
    'System Design',
    'Cybersecurity & Audits',
    'Database Engineering'
  ],
  'ai-data': [
    'LLM & Prompt Engineering',
    'RAG & Vector Search',
    'Machine Learning & PyTorch',
    'Data Pipelines & ETL',
    'Computer Vision & NLP',
    'Model Fine-Tuning'
  ],
  'design': [
    'UI/UX & Product Design',
    'Design Systems & Figma Teardowns',
    'Visual Identity & Branding',
    'Design Tokens & Typography',
    'Mobile App UI',
    'Motion & Micro-interactions'
  ],
  'marketing': [
    'B2B Growth & Demand Gen',
    'Paid Acquisition & PPC',
    'SEO Strategy & Audits',
    'Content & Editorial Strategy',
    'Funnel Optimization & CRO',
    'Outbound & Cold Email Strategy'
  ],
  'business': [
    'Startup Fundraising & Pitch Decks',
    'Fractional COO/Strategy',
    'Product Management',
    'Go-To-Market (GTM) Strategy',
    'Market Research & Feasibility'
  ],
  'finance': [
    'Startup Tax Advisory',
    'Financial Modeling & Projections',
    'Fractional CFO Advisory',
    'Cap Table & Equity Structuring',
    'Delaware C-Corp vs LLC'
  ],
  'legal': [
    'Contract & Agreement Review',
    'Trademarks & IP Strategy',
    'SaaS Terms & Privacy Compliance',
    'Founder & Advisor Agreements'
  ],
  'career': [
    'Resume & Portfolio Teardown',
    'Mock Engineering Interviews',
    'System Design Mock Interview',
    'Engineering Leadership Coaching',
    'Salary & Offer Negotiation'
  ],
  'writing': [
    'Technical Documentation & API Docs',
    'Landing Page Copywriting',
    'Ghostwriting & Thought Leadership',
    'Grant & Proposal Writing'
  ],
  'video-audio': [
    'Video Editing & Post-Production',
    'Motion Graphics & After Effects',
    'Sound Design & Audio Engineering',
    'Podcast Production Consult'
  ],
  'productivity': [
    'Notion Workspace Architecture',
    'Zapier / Make Automation',
    'Workflow & Task Ops',
    'Async Team Collaboration'
  ],
  'health-wellness': [
    'Personal Fitness Training',
    'Yoga & Mindfulness',
    'Zumba & Dance Workout',
    'Dietary & Nutrition Advisory'
  ],
  'other': [
    'Specialized Consultations',
    'Niche Domain Advisory'
  ]
};
