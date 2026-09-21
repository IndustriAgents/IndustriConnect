export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'theme';

export const getTheme = (): Theme => {
  if (typeof window === 'undefined') return 'light';
  try {
    const stored = localStorage.getItem(STORAGE_KEY) as Theme | null;
    if (stored === 'light' || stored === 'dark') return stored;
  } catch {
    /* blocked storage — fall through to the OS preference */
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

/**
 * Themes are switched by a `data-theme` attribute on <html>, matching
 * industriagents.com, whose tokens are all defined under [data-theme="dark"].
 * The inline script in index.html sets the same attribute before first paint.
 */
export const setTheme = (theme: Theme) => {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    /* blocked storage — the attribute below still applies for this session */
  }
  document.documentElement.setAttribute('data-theme', theme);
};

export const toggleTheme = () => {
  const newTheme: Theme = getTheme() === 'dark' ? 'light' : 'dark';
  setTheme(newTheme);
  return newTheme;
};
