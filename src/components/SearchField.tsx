// The app's search input: a pill that takes the accent on focus and offers a
// clear button once there's something to clear. Shared so every search box —
// the exercise library, the log sheet's exercise picker — stays identical.
import { useState } from 'react';
import { MagnifyingGlassIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { accentHex } from '../lib/accent';

const FIELD_BG = 'var(--te-surface-3)';
const HAIRLINE = 'var(--te-border-strong)';
const PLACEHOLDER = 'var(--te-text-3)';

interface Props {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
}

export default function SearchField({ value, onChange, placeholder = 'Search', autoFocus }: Props) {
  const [focused, setFocused] = useState(false);

  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '0 18px', height: 45,
        background: FIELD_BG, borderRadius: 9999,
        border: `1px solid ${focused ? accentHex() : HAIRLINE}`,
        boxShadow: '0 0 7.5px rgba(0,0,0,0.25)',
        transition: 'border-color .15s',
      }}
    >
      <MagnifyingGlassIcon
        style={{ width: 16, height: 16, flexShrink: 0, color: focused ? accentHex() : PLACEHOLDER }}
      />
      <input
        data-no-drag
        value={value}
        onChange={e => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        className="text-[15px] te-t1 placeholder:text-white/25"
        style={{ flex: 1, background: 'none', border: 'none', outline: 'none', letterSpacing: '-0.01em' }}
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label="Clear search"
          style={{
            background: 'var(--te-border-strong)', border: 'none', cursor: 'pointer',
            width: 19, height: 19, borderRadius: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}
        >
          <XMarkIcon style={{ width: 11, height: 11, color: 'var(--te-text-2)' }} />
        </button>
      )}
    </div>
  );
}
