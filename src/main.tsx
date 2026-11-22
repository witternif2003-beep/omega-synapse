import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import CountyForensicOverlay from './components/CountyForensicOverlay.tsx';
import GeorgiaCountyMap from './components/GeorgiaCountyMap.tsx';
import ResearchPlan from './components/ResearchPlan.tsx';
import { installScrollStabilizer } from './lib/scrollStabilizer.ts';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <>
    <App />
    <CountyForensicOverlay />
    <GeorgiaCountyMap />
    <ResearchPlan />
  </>
);

// Keep whatever you are reading in place while the live feed inserts cards above it.
installScrollStabilizer();
