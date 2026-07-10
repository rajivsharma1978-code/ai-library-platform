// Thin re-export — the real three-tier cover-fallback implementation now
// lives in components/ui/BookCover.tsx (shared with my-library, my-books,
// ai-tutor, my-space, and the redesigned /library, instead of five
// separate copy-pasted versions). Kept as a re-export so
// FeaturedBooks/NewArrivals/DirectorCollection/Recommendations don't all
// need their import paths changed.
export { default } from "@/components/ui/BookCover";
