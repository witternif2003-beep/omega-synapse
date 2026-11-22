import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import CountyForensicOverlay from './components/CountyForensicOverlay.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <>
    <App />
    <CountyForensicOverlay />
  </>
);
