import PremiumReaderV2 from "@/components/reader-premium-v2/PremiumReaderV2";
import { BookProfile } from "@/lib/premium-reader/bookProfile";

const demoProfile: BookProfile = {
  bookId: "nalanda-demo",
  title: "Nalanda: The Untold Story",
  pdfPath: "/director-books/nalanda.pdf",
  totalPages: 24,
  readingDirection: "ltr",
  hasCover: true,
  preferredView: "auto",
  version: "premium-reader-v2",
  createdAt: new Date().toISOString(),
  pages: Array.from({ length: 24 }, (_, index) => {
    const pageNumber = index + 1;
    const orientation = pageNumber === 1 ? "landscape" : "portrait";

    return {
      pageNumber,
      width: pageNumber === 1 ? 792 : 612,
height: pageNumber === 1 ? 612 : 792,
      orientation,
      layoutType:
        pageNumber === 1
          ? "cover"
          : pageNumber % 2 === 0
            ? "double-spread-left"
            : "double-spread-right",
      aspectRatio: 0.773,
    };
  }),
};

export default function ReaderPremiumV2Page() {
  return <PremiumReaderV2 profile={demoProfile} />;
}