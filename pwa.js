(() => {
  'use strict';
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js', {updateViaCache:'none'})
        .then(registration => registration.update())
        .catch(error => console.warn('PWA: registrazione non riuscita', error));
    });
  }
  const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  if (standalone) return;
  let installPrompt;
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = 'Installa app';
  button.style.cssText = 'position:fixed;bottom:calc(12px + env(safe-area-inset-bottom));left:12px;z-index:50;background:white;color:#b84d00;border:1px solid #f47b20;border-radius:12px;padding:10px 14px;font:600 13px sans-serif;box-shadow:0 2px 8px #0001;';
  document.body.append(button);
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    installPrompt = event;
  });
  window.addEventListener('appinstalled', () => button.remove());
  button.onclick = async () => {
    if (installPrompt) {
      await installPrompt.prompt();
      const result = await installPrompt.userChoice;
      installPrompt = null;
      if (result.outcome === 'accepted') button.remove();
    } else {
      alert('Su iPhone: apri questo sito in Safari, tocca Condividi, poi Aggiungi alla schermata Home. Attiva Apri come app web se presente.\n\nSu Android o PC: cerca Installa app nel menu del browser.');
    }
  };
})();
