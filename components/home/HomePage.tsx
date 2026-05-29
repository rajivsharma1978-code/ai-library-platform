import { SiteHeader } from "./SiteHeader";
import { HeroSection } from "./HeroSection";
import { StatsDashboard } from "./StatsDashboard";
import { FeaturedBooks } from "./FeaturedBooks";
import { AiTutors } from "./AiTutors";
import { Recommendations } from "./Recommendations";
import { SiteFooter } from "./SiteFooter";

export function HomePage() {
  return (
    <>
      <SiteHeader />
      <main>
        <HeroSection />
        <StatsDashboard />
        <FeaturedBooks />
        <AiTutors />
        <Recommendations />
      </main>
      <SiteFooter />
    </>
  );
}
