import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import CountyForensicOverlay from './components/CountyForensicOverlay.tsx';
import GeorgiaCountyMap from './components/GeorgiaCountyMap.tsx';
import FinancialEspionage from './components/FinancialEspionage.tsx';
import ResearchPlan from './components/ResearchPlan.tsx';
import BuildStamp from './components/BuildStamp.tsx';
import { installScrollStabilizer } from './lib/scrollStabilizer.ts';
import { installEspionageTabStrobe } from './lib/espionageTabStrobe.ts';
import { installEspionageOperations } from './lib/espionageReplacement.ts';
import { installBuildFreshness } from './lib/buildFreshness.ts';
import { GEORGIA_ESPIONAGE_ANOMALIES } from './data/georgiaEspionageLayer.ts';
import './index.css';
import './espionagePinned.css';
import './ciaPanels.css';
import './mobileFixes.css';
import './backgroundLayers.css';
import './espionageOperations.css';

createRoot(document.getElementById('root')!).render(
  <>
    <App />
    <CountyForensicOverlay />
    <GeorgiaCountyMap />
    <FinancialEspionage />
    <ResearchPlan />
    <BuildStamp />
  </>
);

// Keep whatever you are reading in place while the live feed inserts cards above it.
installScrollStabilizer();

// Mark the espionage view tab as just updated.
installEspionageTabStrobe();

// The generated espionage records are no longer published, so the old paged list is
// empty. The tab now renders the sourced operations panel instead.
GEORGIA_ESPIONAGE_ANOMALIES.length = 0;
installEspionageOperations();

// Notice when this page is running an older deployment than the one that is live.
installBuildFreshness(__BUILD_ID__);
