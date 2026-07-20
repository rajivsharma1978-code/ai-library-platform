import DirectorCollection from "./DirectorCollection";
import { SiteHeader } from "./SiteHeader";
import { HeroSection } from "./HeroSection";
import { FeaturedBooks } from "./FeaturedBooks";
import { NewArrivals } from "./NewArrivals";
import { AiTutors } from "./AiTutors";
import { WhyNdlAi } from "./WhyNdlAi";
import { SiteFooter } from "./SiteFooter";
import AccessibilityToolbar from "@/components/ui/AccessibilityToolbar";

// The public Home page is shown to anyone opening the URL, logged in or
// not — so it deliberately carries no user-specific state. StatsDashboard
// (trust numbers) and Recommendations (Continue Reading + Testimonials)
// were part of earlier iterations of this page but are not rendered here:
// Continue Reading is personal reading progress, which has no business on
// a page an anonymous visitor can load, and Stats read as a dashboard-style
// tile grid that fights this page's calmer, Airbnb-style rhythm. Neither
// component was deleted — Continue Reading belongs in My Space or a future
// authenticated Home state, and Stats may still suit an About/Impact page.
//
// Section order is deliberate: Hero → three distinct book-discovery rails
// (Director Collection, the flagship; Featured Books; New Arrivals) →
// AI-Powered Features → Why NDL AI as the closing, confident statement →
// Footer. Every section is full-width and stacked — nothing sits side by
// side with anything else.
export function HomePage() {
  return (
    <>
      <SiteHeader />
      <main>
        <HeroSection />
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
