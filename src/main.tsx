import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import CountyForensicOverlay from './components/CountyForensicOverlay.tsx';
import GeorgiaCountyMap from './components/GeorgiaCountyMap.tsx';
import ResearchPlan from './components/ResearchPlan.tsx';
import BuildStamp from './components/BuildStamp.tsx';
import { installScrollStabilizer } from './lib/scrollStabilizer.ts';
import { installEspionageTabStrobe } from './lib/espionageTabStrobe.ts';
import { installEspionagePager } from './lib/espionagePager.ts';
import { installBuildFreshness } from './lib/buildFreshness.ts';
import './index.css';
import './espionagePinned.css';
import './ciaPanels.css';
import './mobileFixes.css';

createRoot(document.getElementById('root')!).render(
  <>
    <App />
    <CountyForensicOverlay />
    <GeorgiaCountyMap />
    <ResearchPlan />
    <BuildStamp />
  </>
);

// Keep whatever you are reading in place while the live feed inserts cards above it.
installScrollStabilizer();

// Mark the espionage view tab as just updated.
installEspionageTabStrobe();

// Page the 170-target espionage list instead of rendering one 91,000px column.
installEspionagePager(20);

// Notice when this page is running an older deployment than the one that is live.
installBuildFreshness(__BUILD_ID__);
