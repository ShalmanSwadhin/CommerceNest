import { Route, Routes } from 'react-router-dom';
import { HomePage } from './pages/HomePage';
import { LegalPage } from './pages/LegalPage';
import { TrialRequestPage } from './pages/TrialRequestPage';
import { PricingPage } from './pages/PricingPage';
import { ScrollProgressBar } from './components/ScrollProgressBar';

export default function App() {
  return (
    <>
      <ScrollProgressBar />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/trial" element={<TrialRequestPage />} />
        <Route path="/pricing" element={<PricingPage />} />
        <Route
          path="/terms"
          element={
            <LegalPage
              title="Terms of Service"
              body="These Terms of Service will be published before public onboarding. Until then, early-access use of CommerceNest is governed by the agreement shared during demo conversations."
            />
          }
        />
        <Route
          path="/privacy"
          element={
            <LegalPage
              title="Privacy Policy"
              body="CommerceNest processes store and customer data on behalf of merchants. A full privacy policy will be published before public launch. Contact us for current data-handling practices during early access."
            />
          }
        />
        <Route
          path="/refund"
          element={
            <LegalPage
              title="Refund Policy"
              body="Subscription and trial refund terms will be published with public pricing. Demo and early-access arrangements are confirmed in writing before any charge."
            />
          }
        />
      </Routes>
    </>
  );
}
