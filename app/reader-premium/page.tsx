import { Suspense } from "react";
import PremiumReaderPreviewContent from "@/components/reader-premium/PremiumReaderPreviewContent";

export default function PremiumReaderPage() {
  return (
    <Suspense fallback={<div className="p-6">Loading reader...</div>}>
      <PremiumReaderPreviewContent />
    </Suspense>
  );
}
