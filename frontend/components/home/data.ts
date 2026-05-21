export const STATS = [
  { label: "Digital volumes", value: "2.4M+", icon: "📚" },
  { label: "Active learners", value: "180K+", icon: "👥" },
  { label: "Languages supported", value: "50+", icon: "🌐" },
  { label: "AI sessions today", value: "12.5K", icon: "✨" },
] as const;

export const FEATURED_BOOKS = [
  {
    title: "Introduction to Public Policy",
    author: "Dr. A. Sharma",
    category: "Governance",
    gradient: "from-slate-200 to-slate-300",
  },
  {
    title: "Climate Science for Citizens",
    author: "Prof. R. Menon",
    category: "Environment",
    gradient: "from-emerald-100 to-teal-200",
  },
  {
    title: "Digital India: A Handbook",
    author: "Ministry of Electronics & IT",
    category: "Technology",
    gradient: "from-blue-100 to-indigo-200",
  },
  {
    title: "Constitutional Foundations",
    author: "Legal Research Cell",
    category: "Law",
    gradient: "from-amber-100 to-orange-200",
  },
] as const;

export const AI_TUTORS = [
  {
    subject: "Mathematics",
    description: "Step-by-step problem solving from algebra to calculus.",
    icon: "∑",
    sessions: "24K sessions",
  },
  {
    subject: "Science & Technology",
    description: "Interactive explanations with diagrams and experiments.",
    icon: "⚗",
    sessions: "18K sessions",
  },
  {
    subject: "History & Civics",
    description: "Timeline-based learning with primary source analysis.",
    icon: "🏛",
    sessions: "15K sessions",
  },
  {
    subject: "Languages & Literature",
    description: "Grammar, comprehension, and literary analysis support.",
    icon: "📖",
    sessions: "21K sessions",
  },
] as const;

export const RECOMMENDATIONS = [
  {
    title: "Urban Planning in the 21st Century",
    reason: "Based on your governance reading",
    match: "94% match",
  },
  {
    title: "Renewable Energy Policy Framework",
    reason: "Trending in your region",
    match: "89% match",
  },
  {
    title: "Data Ethics for Public Servants",
    reason: "Complements recent searches",
    match: "91% match",
  },
  {
    title: "Indian Economic Survey — Selected Readings",
    reason: "Popular among researchers like you",
    match: "87% match",
  },
] as const;
