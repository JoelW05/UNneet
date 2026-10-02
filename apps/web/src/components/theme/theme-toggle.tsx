'use client';

import { Monitor, Moon, Sun } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';

type Theme = 'system' | 'light' | 'dark';
const KEY = 'unneet.theme';
const ORDER: Theme[] = ['system', 'light', 'dark'];

function apply(theme: Theme) {
  const root = document.documentElement;
  if (theme === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme);
}

const LABEL: Record<Theme, string> = {
  system: 'Colour theme: match my device',
  light: 'Colour theme: light',
  dark: 'Colour theme: dark',
};

/**
 * Three-way theme switch (device / light / dark). The choice is remembered in this browser; a
 * tiny script in <head> (see ThemeScript) applies it before first paint to avoid a flash.
 */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('system');

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(KEY) as Theme | null;
      if (saved && ORDER.includes(saved)) setTheme(saved);
    } catch {
      // storage blocked: stay on "system"
    }
  }, []);

  const Icon = theme === 'dark' ? Moon : theme === 'light' ? Sun : Monitor;

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={`${LABEL[theme]}. Press to change.`}
      title={LABEL[theme]}
      onClick={() => {
        const next = ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length] as Theme;
        setTheme(next);
        apply(next);
        try {
          if (next === 'system') window.localStorage.removeItem(KEY);
          else window.localStorage.setItem(KEY, next);
        } catch {
          // ignore
        }
      }}
    >
      <Icon aria-hidden className="size-5" />
    </Button>
  );
}

/** Runs before paint. Inline, so it carries the request's CSP nonce (passed in by the layout). */
export function ThemeScript({ nonce }: { nonce?: string | undefined }) {
  const code = `try{var t=localStorage.getItem('${KEY}');if(t==='light'||t==='dark')document.documentElement.setAttribute('data-theme',t)}catch(e){}`;
  // biome-ignore lint/security/noDangerouslySetInnerHtml: a fixed, constant string with no user input.
  return <script nonce={nonce} dangerouslySetInnerHTML={{ __html: code }} />;
}
