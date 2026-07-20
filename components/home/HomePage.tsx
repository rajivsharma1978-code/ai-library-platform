import DirectorCollection from "./DirectorCollection";
import { SiteHeader } from "./SiteHeader";
import { HeroSection } from "./HeroSection";
import { StatsDashboard } from "./StatsDashboard";
import { FeaturedBooks } from "./FeaturedBooks";
import { NewArrivals } from "./NewArrivals";
import { AiTutors } from "./AiTutors";
import { Recommendations } from "./Recommendations";
import { SiteFooter } from "./SiteFooter";
import AccessibilityToolbar from "@/components/ui/AccessibilityToolbar";

// Five distinct discovery mechanisms (Phase H-1C), each with its own
// product responsibility and its own card shape so they read as curated
// rather than the same carousel repeated:
//   Director Collection — flagship curated showcase, largest cards
//   Featured Books       — lightweight editorial rail, small cover-only cards
//   Recommended for You  — AI-driven rail, compact list chips (thumbnail+text)
//   Continue Reading      — personal progress (inside Recommendations)
//   Testimonials           — social proof (inside Recommendations)
// All three book carousels are grouped right after the hero so browsing
// isn't interrupted by the stats strip; Stats/AI Features/Recommendations
// follow as their own beat.
export function HomePage() {
  return (
    <>
      <SiteHeader />
      <main>
        <HeroSection />
        <DirectorCollection />
        <FeaturedBooks />
        <NewArrivals />
        <StatsDashboard />
        <AiTutors />
        <Recommendations />
      </main>
      <SiteFooter />
      <AccessibilityToolbar />
    </>
  );
}
