const { invoke } = window.__TAURI__.core;
const input = document.getElementById('text');
const error = document.getElementById('error');

input.placeholder = (navigator.language || 'fr').toLowerCase().startsWith('fr')
  ? 'Capturer dans la boîte de réception, puis Entrée'
  : 'Capture to the inbox, then press Enter';

input.addEventListener('keydown', async (event) => {
  if (event.key === 'Escape') {
    invoke('close_quick');
  } else if (event.key === 'Enter' && input.value.trim()) {
    event.preventDefault();
    try {
      await invoke('capture', { text: input.value });
    } catch (e) {
      error.textContent = String(e);
    }
  }
});

// Close when focus leaves, but only after the window has really been focused once.
let armed = false;
window.addEventListener('focus', () => { armed = true; });
window.addEventListener('blur', () => { if (armed) invoke('close_quick'); });
