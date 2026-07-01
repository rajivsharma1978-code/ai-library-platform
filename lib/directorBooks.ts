export type DirectorBook = {
  id: string;
  title: string;
  author: string;
  description: string;
  language: string;
  cover: string;
  pdf: string;
  pages: number;
};

export const directorBooks: DirectorBook[] = [
  {
    id: "nalanda",
    title: "Nalanda: The Untold Story",
    author: "Yuvraj Malik",
    description:
      "A richly illustrated story that brings the legacy of Nalanda to life for young readers through history, culture, imagination, and learning.",
    language: "English",
    cover: "/director-books/nalanda-cover.jpg",
    pdf: "/director-books/nalanda.pdf",
    pages: 32,
  },
  {
    id: "chandrayaan-3",
    title: "Chandrayaan 3: Tiranga Flies on the Moon",
    author: "Yuvraj Malik",
    description:
      "An inspiring illustrated book on India's Chandrayaan 3 mission, space exploration, science, curiosity, and national achievement.",
    language: "English",
    cover: "/director-books/chandrayaan-3-cover.jpg",
    pdf: "/director-books/chandrayaan-3.pdf",
    pages: 35,
  },
  {
    id: "quantum",
    title: "Introduction to Classical and Quantum Computing",
    author: "Thomas G. Wong",
    description:
      "A comprehensive textbook introducing the mathematical foundations of both classical and quantum computing, written for students with a basic background in linear algebra.",
    language: "English",
    cover: "/director-books/quantum-cover.jpg",
    pdf: "/director-books/quantum-computing.pdf",
    pages: 400,
  },
];