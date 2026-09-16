// In-app theme override, independent of the OS-level dark/light setting.
// 'auto' (the default) leaves no data-theme attribute, so the CSS media
// query in styles.css follows the device's own setting exactly as before
// this existed. 'light'/'dark' force it via :root[data-theme="..."]
// rules — see the "Glow theme" comment in styles.css for where those are
// defined. The actual application on page load happens in an inline
// <script> in each HTML file's <head> (before this module loads), to
// avoid a flash of the wrong theme.
const KEY = 'theme';

export function getTheme() {
  try {
    const t = localStorage.getItem(KEY);
    return t === 'light' || t === 'dark' ? t : 'auto';
  } catch {
    return 'auto';
  }
}

export function setTheme(value) {
  try {
    if (value === 'auto') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, value);
  } catch {
    // Storage unavailable (private browsing, quota) — the choice just
    // won't persist across reloads; still apply it for this session.
  }
  if (value === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', value);
}
