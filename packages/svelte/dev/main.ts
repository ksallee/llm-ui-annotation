import { autoMount } from '../src/auto.js';

void autoMount({ accent: '#2C8A85', scheme: 'auto' });

const accent = document.querySelector<HTMLInputElement>('#accent');
accent?.addEventListener('input', () => {
  document.documentElement.style.setProperty('--annot-accent', accent.value);
});

const dark = document.querySelector<HTMLButtonElement>('#dark');
dark?.addEventListener('click', () => {
  const root = document.documentElement;
  const next = root.style.colorScheme === 'dark' ? 'light' : 'dark';
  root.style.colorScheme = next;
  document.body.style.background = next === 'dark' ? '#14161a' : '#fbfbfa';
  document.body.style.color = next === 'dark' ? '#e8e8e6' : '#1b1c1e';
});
