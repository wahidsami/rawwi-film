import Hero from '../components/Hero';
import About from '../components/About';
import Services from '../components/Services';
import FilmedIn from '../components/FilmedIn';
import News from '../components/News';

export default function Home() {
  return (
    <main id="main-content" className="flex-grow">
      <Hero />
      <About />
      <Services />
      <FilmedIn />
      <News />
    </main>
  );
}
