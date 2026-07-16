import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Header from './components/Header';
import Footer from './components/Footer';
import Home from './pages/Home';
import ScriptApproval from './pages/ScriptApproval';
import { useLanguage } from './contexts/LanguageContext';

export default function App() {
  const { t, language } = useLanguage();

  return (
    <Router>
      <div className={`min-h-screen bg-gov-surface flex flex-col ${language === 'ar' ? 'font-arabic' : 'font-sans'}`}>
        <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:start-4 z-[100] bg-sfc-navy text-white px-4 py-2 rounded-md font-medium outline-none ring-2 ring-sfc-green">
          {t('skipToMain')}
        </a>
        <Header />
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/services/script-approval" element={<ScriptApproval />} />
        </Routes>
        <Footer />
      </div>
    </Router>
  );
}
