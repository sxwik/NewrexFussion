const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

const replacements = {
  'bg-[#0A0A0B]': 'bg-[var(--bg-main)]',
  'bg-[#111113]': 'bg-[var(--bg-panel)]',
  'bg-[#141416]': 'bg-[var(--bg-surface)]',
  'bg-[#1A1A1E]': 'bg-[var(--bg-surface-hover)]',
  'bg-[#1A191C]': 'bg-[var(--bg-modal)]',
  'border-[#262529]': 'border-[var(--bg-border-strong)]',
  'text-[#F0EEE6]': 'text-[var(--text-primary)]',
  'text-[#F9F7F1]': 'text-[var(--text-primary)]',
  'text-[#E8DBCE]': 'text-[var(--text-primary)]',
  'text-[#A6A4AD]': 'text-[var(--text-secondary)]',
  'text-[#8E8B95]': 'text-[var(--text-muted)]',
  'text-[#D4D2D8]': 'text-[var(--text-secondary)]',
  'text-[#6C6975]': 'text-[var(--text-muted-dark)]',
  'text-[#5C5A65]': 'text-[var(--text-muted-dark)]',
  'text-[#0E0D11]': 'text-[var(--bg-main)]',
  'bg-[#EADDCB]': 'bg-[var(--accent-primary)]',
  'bg-[#E8DBCE]': 'bg-[var(--accent-primary)]',
  'bg-[#F2E8DE]': 'bg-[var(--accent-hover)]',
  'text-[#111113]': 'text-[var(--bg-main)]',
  'from-[#0A0A0B]': 'from-[var(--bg-main)]',
  'via-[#0A0A0B]': 'via-[var(--bg-main)]',
  'bg-white/[0.04]': 'bg-[var(--bg-overlay-04)]',
  'bg-white/[0.02]': 'bg-[var(--bg-overlay-02)]',
  'bg-white/[0.03]': 'bg-[var(--bg-overlay-03)]',
  'bg-white/[0.05]': 'bg-[var(--bg-overlay-05)]',
  'bg-white/[0.1]': 'bg-[var(--bg-overlay-10)]',
  'border-white/[0.04]': 'border-[var(--border-light)]',
  'border-white/[0.03]': 'border-[var(--border-light)]',
  'border-white/[0.1]': 'border-[var(--border-medium)]',
  'border-white/[0.2]': 'border-[var(--border-strong)]',
  'border-white/[0.05]': 'border-[var(--border-medium)]',
  'hover:bg-white/[0.02]': 'hover:bg-[var(--bg-overlay-02)]',
  'hover:bg-white/[0.05]': 'hover:bg-[var(--bg-overlay-05)]',
  'hover:bg-white/[0.1]': 'hover:bg-[var(--bg-overlay-10)]',
  'hover:text-[#F0EEE6]': 'hover:text-[var(--text-primary)]',
  'hover:text-[#D4D2D8]': 'hover:text-[var(--text-secondary)]',
  'ring-white/10': 'ring-[var(--border-medium)]',
  'text-white': 'text-[var(--text-inverse)]',
  'bg-white': 'bg-[var(--bg-inverse)]'
};

for (const [key, value] of Object.entries(replacements)) {
  code = code.split(key).join(value);
}

fs.writeFileSync('src/App.tsx', code);
console.log('App.tsx transformed');
