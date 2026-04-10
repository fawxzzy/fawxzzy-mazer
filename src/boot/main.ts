import Phaser from 'phaser';
import '../styles/base.css';
import { initializeInstallSurface } from './installSurface';
import { phaserConfig } from './phaserConfig';

const isLocalhost =
  window.location.hostname === 'localhost' ||
  window.location.hostname === '127.0.0.1' ||
  window.location.hostname === '[::1]';

if ('serviceWorker' in navigator && isLocalhost) {
  navigator.serviceWorker
    .getRegistrations()
    .then((registrations) => Promise.all(registrations.map((registration) => registration.unregister())))
    .catch(() => {
      // no-op: we explicitly avoid stale local SW state during development
    });
}

initializeInstallSurface();
new Phaser.Game(phaserConfig);
