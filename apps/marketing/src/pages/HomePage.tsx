import { SiteNavbar } from '@/components/SiteNavbar';
import { HeroSection } from '@/components/HeroSection';
import { TrustStrip } from '@/components/TrustStrip';
import { FeaturesSection } from '@/components/FeaturesSection';
import { HowItWorksSection } from '@/components/HowItWorksSection';
import { BangladeshSection } from '@/components/BangladeshSection';
import { StatsSection } from '@/components/StatsSection';
import { TestimonialsSection } from '@/components/TestimonialsSection';
import { SecuritySection } from '@/components/SecuritySection';
import { FaqSection } from '@/components/FaqSection';
import { FinalCTA } from '@/components/FinalCTA';
import { ContactSection } from '@/components/ContactSection';
import { SiteFooter } from '@/components/SiteFooter';
import { usePageMeta, useHashScrollOnMount } from '@/lib/pageMeta';

export function HomePage() {
  usePageMeta({
    title: 'CommerceNest — Build. Grow. Scale.',
    description:
      'CommerceNest — multi-tenant e-commerce SaaS for Bangladesh. Manual bKash, COD, themes, and powerful admin tools.',
    path: '/',
  });
  useHashScrollOnMount();

  return (
    <div className="min-h-screen bg-navy">
      <SiteNavbar />
      <main>
        <HeroSection />
        <TrustStrip />
        <FeaturesSection />
        <HowItWorksSection />
        <BangladeshSection />
        <StatsSection />
        <TestimonialsSection />
        <SecuritySection />
        <FaqSection />
        <FinalCTA />
        <ContactSection />
      </main>
      <SiteFooter />
    </div>
  );
}
