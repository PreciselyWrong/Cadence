const { invoke } = window.__TAURI__.core;

const T = {
  fr: {
    title: 'Réglages Cadence',
    server: 'Adresse du serveur',
    hServer: 'Celle que vous ouvrez dans le navigateur.',
    token: 'Clé API',
    hToken: 'Une clé tt_… créée dans Cadence (Profil, Clés API). Nécessaire pour l’ajout rapide et les notifications.',
    shortcut: 'Raccourci global',
    hShortcut: 'Exemple : Ctrl+Alt+Space. Ouvre l’ajout rapide depuis n’importe où. Sous Wayland, la touche se règle dans les raccourcis du bureau (Cadence y apparaît).',
    autostart: 'Lancer Cadence à l’ouverture de session',
    hAutostart: 'Démarre dans la barre système, sans fenêtre.',
    save: 'Enregistrer',
  },
  en: {
    title: 'Cadence settings',
    server: 'Server address',
    hServer: 'The one you open in the browser.',
    token: 'API key',
    hToken: 'A tt_… key created in Cadence (Profile, API keys). Needed for quick add and notifications.',
    shortcut: 'Global shortcut',
    hShortcut: 'Example: Ctrl+Alt+Space. Opens quick add from anywhere. Under Wayland the key is set in the desktop’s shortcut settings (Cadence appears there).',
    autostart: 'Start Cadence at login',
    hAutostart: 'Starts in the tray, without a window.',
    save: 'Save',
  },
};
const t = T[(navigator.language || 'fr').toLowerCase().startsWith('fr') ? 'fr' : 'en'];

const $ = (id) => document.getElementById(id);
$('title').textContent = t.title;
$('l_server').textContent = t.server;
$('h_server').textContent = t.hServer;
$('l_token').textContent = t.token;
$('h_token').textContent = t.hToken;
$('l_shortcut').textContent = t.shortcut;
$('h_shortcut').textContent = t.hShortcut;
$('l_autostart').textContent = t.autostart;
$('h_autostart').textContent = t.hAutostart;
$('save').textContent = t.save;

let loaded = {};
invoke('get_config').then((cfg) => {
  loaded = cfg;
  $('server_url').value = cfg.server_url;
  $('api_token').value = cfg.api_token;
  $('shortcut').value = cfg.shortcut;
  $('autostart').checked = cfg.autostart;
});

$('form').addEventListener('submit', async (event) => {
  event.preventDefault();
  $('error').textContent = '';
  try {
    await invoke('save_config', {
      config: {
        ...loaded,
        server_url: $('server_url').value,
        api_token: $('api_token').value,
        shortcut: $('shortcut').value,
        autostart: $('autostart').checked,
      },
    });
  } catch (e) {
    $('error').textContent = String(e);
  }
});
