export const STATS = [
  { label: "Digital volumes", value: "2.4M+", icon: "📚" },
  { label: "Active learners", value: "180K+", icon: "👥" },
  { label: "Languages supported", value: "22", icon: "🌐" },
  { label: "AI sessions today", value: "185K", icon: "✨" },
] as const;

export type BookBadge = "New" | "Trending" | "Editor's Pick" | "Classic" | null;

export interface Book {
  title: string;
  author: string;
  category: string;
  pages: number;
  coverBg: string;
  spineColor: string;
  badge: BookBadge;
  isNew?: boolean;
  description: string;
  language: string;
}

export const ALL_BOOKS: Book[] = [
  {
    title: "Artificial Intelligence",
    author: "Stuart Russell & Peter Norvig",
    category: "Technology",
    pages: 1132,
    coverBg: "#c8d4e8",
    spineColor: "#2a4a8a",
    badge: "Editor's Pick",
    description: "The definitive textbook on AI — reasoning, learning, robotics, and intelligent agents.",
    language: "English",
  },
  {
    title: "Machine Learning",
    author: "Sebastian Raschka",
    category: "Technology",
    pages: 774,
    coverBg: "#d0c8e0",
    spineColor: "#5a3a8a",
    badge: "Trending",
    description: "Practical machine learning with Python — algorithms, models, and deep learning.",
    language: "English",
  },
  {
    title: "Data Science",
    author: "Jake VanderPlas",
    category: "Technology",
    pages: 548,
    coverBg: "#c8dcd0",
    spineColor: "#2a6a4a",
    badge: null,
    description: "From data wrangling to visualization — a complete data science handbook.",
    language: "English",
  },
  {
    title: "Deep Learning",
    author: "Ian Goodfellow",
    category: "Technology",
    pages: 800,
    coverBg: "#e0d0c8",
    spineColor: "#8a4a2a",
    badge: "New",
    isNew: true,
    description: "Neural networks, transformers, computer vision, and advanced AI architectures.",
    language: "English",
  },
  {
    title: "Quantum Computing",
    author: "DST · IISc Bangalore",
    category: "Research",
    pages: 420,
    coverBg: "#d8e0c8",
    spineColor: "#4a6a2a",
    badge: "New",
    isNew: true,
    description: "India's quantum roadmap — qubits, superposition, and next-gen computing.",
    language: "English",
  },
  {
    title: "Cyber Security",
    author: "CERT-In · MeitY",
    category: "Governance",
    pages: 450,
    coverBg: "#dce8d8",
    spineColor: "#3a6a3a",
    badge: "Trending",
    description: "Network protection, encryption, digital threats, and secure systems for public servants.",
    language: "English",
  },
  {
    title: "Python Basics",
    author: "Guido van Rossum",
    category: "Technology",
    pages: 320,
    coverBg: "#e8e0c8",
    spineColor: "#8a6a2a",
    badge: null,
    description: "From variables to functions — beginner-friendly Python for everyone.",
    language: "English",
  },
  {
    title: "Robotics",
    author: "Bruno Siciliano",
    category: "Technology",
    pages: 632,
    coverBg: "#c8dce8",
    spineColor: "#2a5a7a",
    badge: null,
    description: "Intelligent machines, automation, sensors, and AI-powered physical systems.",
    language: "English",
  },
  {
    title: "Cloud Architecture",
    author: "NASSCOM · MeitY",
    category: "Technology",
    pages: 380,
    coverBg: "#e0e8d0",
    spineColor: "#4a6a3a",
    badge: null,
    description: "Cloud services, distributed systems, scaling, and deployment for modern India.",
    language: "English",
  },
];

export const FEATURED_BOOKS = ALL_BOOKS.slice(0, 4);

export const NEW_ARRIVALS = ALL_BOOKS.filter(b => b.isNew || b.badge === "New" || b.badge === "Trending");

export const EDITOR_PICKS = ALL_BOOKS.filter(b => b.badge === "Editor's Pick" || b.badge === "Classic");

export const AI_SUMMARIES: Record<string, string> = {
  "Artificial Intelligence":
    "This foundational text covers intelligent agents, search, knowledge representation, planning, learning, and robotics. It bridges theory and practice across all major sub-fields of AI, making it essential reading for students and practitioners alike.",
  "Machine Learning":
    "A hands-on guide to supervised, unsupervised, and deep learning. Covers scikit-learn, TensorFlow, and PyTorch with real-world examples, helping readers build production-grade ML systems from the ground up.",
  "Data Science":
    "Comprehensive coverage of the Python data science ecosystem — NumPy, Pandas, Matplotlib, and Scikit-learn. From data cleaning to predictive modelling, with a focus on reproducible, open science.",
  "Deep Learning":
    "The authoritative text on neural networks — from backpropagation to convolutional nets, RNNs, transformers, and generative models. Rigorous mathematical foundations paired with practical guidance.",
  "Quantum Computing":
    "India's national quantum research roadmap: qubits, superposition, entanglement, and quantum advantage. Explains near-term applications in cryptography, optimization, and pharmaceutical research.",
  "Cyber Security":
    "A practical guide for government and enterprise security professionals: threat modeling, network hardening, incident response, and India-specific compliance frameworks under CERT-In guidelines.",
  "Python Basics":
    "The ideal starting point for anyone new to programming. Covers Python syntax, control flow, functions, file I/O, and basic data structures with clear examples and exercises throughout.",
  "Robotics":
    "From kinematics to computer vision — a thorough treatment of robotic systems, motion planning, sensor fusion, and AI-powered autonomy, with applications in manufacturing and service robots.",
  "Cloud Architecture":
    "Cloud-native design patterns for Indian public sector and enterprise: microservices, containerization, serverless functions, and the DigiYatra/DigiLocker-style architecture patterns.",
};

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
    title: "Deep Learning",
    reason: "Because you read Artificial Intelligence",
    match: "96% match",
  },
  {
    title: "Quantum Computing",
    reason: "Trending in Technology",
    match: "89% match",
  },
  {
    title: "Cyber Security",
    reason: "Popular among researchers like you",
    match: "91% match",
  },
  {
    title: "Cloud Architecture",
    reason: "Complements your recent searches",
    match: "87% match",
  },
] as const;

export const LEARNING_PATHS = [
  { title: "AI & Machine Learning Track", modules: 8, duration: "6 weeks", level: "Intermediate" },
  { title: "Data Science Foundations", modules: 6, duration: "4 weeks", level: "Beginner" },
  { title: "Cloud & Security Research Path", modules: 10, duration: "8 weeks", level: "Advanced" },
];

export const READING_HISTORY = [
  { title: "Artificial Intelligence", lastRead: "Yesterday", progress: 72 },
  { title: "Machine Learning", lastRead: "2 days ago", progress: 45 },
  { title: "Python Basics", lastRead: "Last week", progress: 88 },
];
