import { SiteNavbar } from '@/components/SiteNavbar';
import { HeroSection } from '@/components/HeroSection';
import { TrustStrip } from '@/components/TrustStrip';
import { FeaturesSection } from '@/components/FeaturesSection';
import { BangladeshSection } from '@/components/BangladeshSection';
import { StatsSection } from '@/components/StatsSection';
import { TestimonialsSection } from '@/components/TestimonialsSection';
import { SecuritySection } from '@/components/SecuritySection';
import { FinalCTA } from '@/components/FinalCTA';
import { ContactSection } from '@/components/ContactSection';
import { SiteFooter } from '@/components/SiteFooter';

export function HomePage() {
  return (
    <div className="min-h-screen bg-navy">
      <SiteNavbar />
      <main>
        <HeroSection />
        <TrustStrip />
        <FeaturesSection />
        <BangladeshSection />
        <StatsSection />
        <TestimonialsSection />
        <SecuritySection />
        <FinalCTA />
        <ContactSection />
      </main>
      <SiteFooter />
    </div>
  );
}
