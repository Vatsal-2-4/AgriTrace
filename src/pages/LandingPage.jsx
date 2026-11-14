import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, BadgeCheck, BarChart3, CheckCircle2, Globe, ShieldCheck, Sprout, WalletCards } from 'lucide-react';
import './LandingPage.css';
import { applyPageLanguage, saveLanguage, SUPPORTED_LANGUAGES } from '../utils/languagePreference';
import greenFields from '../assets/agritrace-fields-green.jpg';
import purpleFields from '../assets/agritrace-fields-dusk.jpg';
import Footer from '../components/Footer';

const stats = [['₹2.4 Cr+', 'value discovered this week'], ['1,240', 'active farmer lots'], ['86', 'verified buyers nearby'], ['24h', 'average payment settlement']];

export default function LandingPage() {
  const [language, setLanguage] = useState(() => localStorage.getItem('khetsetu_language_guest') || 'en');

  useEffect(() => {
    applyPageLanguage(language);
  }, [language]);

  const changeLanguage = (nextLanguage) => {
    setLanguage(nextLanguage);
    saveLanguage('', nextLanguage);
    applyPageLanguage(nextLanguage);
    window.setTimeout(() => window.location.reload(), 80);
  };

  return <div className="agri-landing">
    <header className="al-nav">
      <Link to="/" className="al-brand">Agri<span>Trace</span></Link>
      <nav aria-label="Main navigation"><a href="#how">How it works</a><a href="#network">For FPOs</a><a href="#trust">Trust centre</a></nav>
      <div className="al-nav-actions"><label className="al-language"><Globe size={15}/><select value={language} onChange={(event) => changeLanguage(event.target.value)} aria-label="Translate page">{SUPPORTED_LANGUAGES.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}</select></label><Link to="/login" className="al-login">Sign in</Link><Link to="/platform" className="al-button al-dark-button">Open platform <ArrowRight size={16}/></Link></div>
    </header>
    <main>
      <section className="al-hero" aria-labelledby="al-heading"><div className="al-hero-content"><div className="al-hero-copy">
        <p className="al-kicker"><span/>AI market intelligence for Indian agriculture</p>
        <h1 id="al-heading">Know the market.<br/>Sell with confidence.</h1>
        <p className="al-intro">AgriTrace helps farmers and FPOs discover the right price, the right buyer, and the right moment to sell - from farm gate to verified payment.</p>
        <div className="al-hero-actions"><Link to="/platform" className="al-button al-lime-button">Explore your market <ArrowRight size={17}/></Link><a href="#how">See how AgriTrace works <ArrowRight size={16}/></a></div>
        <div className="al-trust-note"><div className="al-avatars"><span>R</span><span>S</span><span>A</span><span>+</span></div><p>Built for 10,000+ growers, FPOs &amp; buyers</p></div>
      </div><div className="al-hero-art" aria-hidden="true"><div className="al-dots"/><div className="al-note"><BarChart3 size={18}/><span>Today's price signal<strong>Hold for 3-5 days</strong><b>↑ 4.8% projected</b></span></div><div className="al-note al-note-match"><BadgeCheck size={19}/><span>Buyer match found<strong>Shree Foods Pvt. Ltd.</strong><b>92% lot-fit score</b></span></div></div></div>
        <figure className="al-hero-photo"><img src={greenFields} alt="Green tea fields beneath a wide evening sky"/><figcaption><Sprout size={18}/> Crop intelligence, rooted locally</figcaption></figure>
      </section>
      <section className="al-stats" aria-label="AgriTrace marketplace activity">{stats.map(([value, label]) => <div key={label}><strong>{value}</strong><span>{label}</span></div>)}</section>
      <section id="how" className="al-how"><div className="al-section-heading"><h2>Less guessing.<br/><span>More bargaining power.</span></h2><p>Every decision, service and transaction comes together in a single farmer-first workflow.</p></div><div className="al-steps"><article><span className="al-step-icon"><BarChart3/></span><h3>Read your market</h3><p>Compare local mandi prices, arrivals, demand signals and expected trends in one view.</p></article><article><span className="al-step-icon"><Sprout/></span><h3>Create a sell-ready lot</h3><p>Add produce, quality grade, quantity and your preferred sale window in minutes.</p></article><article><span className="al-step-icon"><BadgeCheck/></span><h3>Match with trusted buyers</h3><p>Receive offers from verified buyers whose requirements fit your lot.</p></article><article><span className="al-step-icon"><WalletCards/></span><h3>Settle with certainty</h3><p>Coordinate pickup and track protected UPI payments from offer to settlement.</p></article></div></section>
      <section id="network" className="al-network"><div className="al-network-copy"><p className="al-kicker">Made for collective strength</p><h2>Your FPO’s market desk,<br/>always on.</h2><p>Aggregate member lots, unlock larger buyers and negotiate with live intelligence at your side.</p><Link to="/platform" className="al-button al-dark-button">View FPO workspace <ArrowRight size={16}/></Link><ul><li><CheckCircle2/>Aggregate lots across members</li><li><CheckCircle2/>Coordinate storage &amp; transport</li><li><CheckCircle2/>Share transparent transaction records</li></ul></div><figure className="al-network-photo"><img src={purpleFields} alt="Farmers working in flooded fields beneath a lavender dusk sky"/><figcaption>Collective strength, from farm to market</figcaption></figure></section>
      <section id="trust" className="al-trust"><ShieldCheck/><div><p className="al-kicker">Verified. Transparent. Accountable.</p><h2>A more dependable agricultural market.</h2></div><p>Buyer credentials, quality specifications, logistics status and every payment milestone are visible in one shared record.</p></section>
    </main><Footer />
  </div>;
}
