import DirectorCollection from "./DirectorCollection";
import { SiteHeader } from "./SiteHeader";
import { HeroSection } from "./HeroSection";
import { StatsDashboard } from "./StatsDashboard";
import { FeaturedBooks } from "./FeaturedBooks";
import { NewArrivals } from "./NewArrivals";
import { AiTutors } from "./AiTutors";
import { Recommendations } from "./Recommendations";
import { SiteFooter } from "./SiteFooter";

export function HomePage() {
  return (
    <>
      <SiteHeader />
      <main>
        <HeroSection />
        <DirectorCollection />
        <StatsDashboard />
        <FeaturedBooks />
        <NewArrivals />
        <AiTutors />
        <Recommendations />
      </main>
      <SiteFooter />
    </>
  );
}
