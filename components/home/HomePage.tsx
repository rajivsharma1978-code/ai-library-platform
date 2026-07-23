import DirectorCollection from "./DirectorCollection";
import { SiteHeader } from "./SiteHeader";
import { HeroSection } from "./HeroSection";
import { FeaturedBooks } from "./FeaturedBooks";
import { NewArrivals } from "./NewArrivals";
import { Recommendations } from "./Recommendations";
import { AiTutors } from "./AiTutors";
import { WhyNdlAi } from "./WhyNdlAi";
import { SiteFooter } from "./SiteFooter";
import AccessibilityToolbar from "@/components/ui/AccessibilityToolbar";

// The public Home page is shown to anyone opening the URL, logged in or
// not — so StatsDashboard (trust numbers, dashboard-style tile grid) still
// has no place here; it fights this page's calmer, Airbnb-style rhythm and
// may suit an About/Impact page instead.
//
// Recommendations (Continue Reading + Testimonials) WAS excluded here too
// for the same anonymous-visitor reasoning — but it already renders a
// labeled "Demo" placeholder instead of real personal data when there's no
// stored reading progress (see its own usingDemoProgress logic), so an
// anonymous visitor never actually sees anyone else's data. Phase B2 (Mobile
// Home Experience) re-introduces it as a mobile-only section — Continue
// Reading is the single most personally relevant thing Home can lead with
// on a phone — while leaving desktop exactly as it was (`lg:hidden`).
//
// Section order (desktop, unchanged): Hero → three book-discovery rails
// (Director Collection, the flagship; Featured Books; New Arrivals) →
// AI-Powered Features → Why NDL AI → Footer. Recommendations only ever
// renders in the mobile layout, positioned right after Hero to lead with
// it, per its own internal comment ("Continue Reading... so it leads").
export function HomePage() {
  return (
    <>
      <SiteHeader />
      <main>
        <HeroSection />
        <div className="lg:hidden">
          <Recommendations />
        </div>
        <DirectorCollection />
        <FeaturedBooks />
        <NewArrivals />
        <AiTutors />
        <WhyNdlAi />
      </main>
      <SiteFooter />
      <AccessibilityToolbar />
    </>
  );
}
