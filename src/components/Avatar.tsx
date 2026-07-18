import dumbbellIcon from '../assets/avatars/dumbbell.svg';
import chartIcon from '../assets/avatars/chart.svg';
import chartLineIcon from '../assets/avatars/chart-line.svg';
import circleIcon from '../assets/avatars/circle.svg';
import squareIcon from '../assets/avatars/square.svg';

// Preset avatars are stored on profiles.avatar_url as "preset:<key>" so the
// client never needs a network round-trip to render them.
export const AVATAR_PRESETS = [
  { key: 'dumbbell', src: dumbbellIcon },
  { key: 'chart', src: chartIcon },
  { key: 'chart-line', src: chartLineIcon },
  { key: 'circle', src: circleIcon },
  { key: 'square', src: squareIcon },
] as const;

export type AvatarPresetKey = typeof AVATAR_PRESETS[number]['key'];

const PRESET_SRC: Record<string, string> = Object.fromEntries(
  AVATAR_PRESETS.map(p => [p.key, p.src]),
);

export function presetKeyOf(avatarUrl: string | null | undefined): string | null {
  return avatarUrl?.startsWith('preset:') ? avatarUrl.slice(7) : null;
}

function initials(name: string): string {
  const parts = name.trim().split(/[\s_]+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

interface Props {
  name: string;
  avatarUrl?: string | null;
  size?: number;
  ring?: boolean;
}

// A thin outline ring so avatars read clearly against photos/dark panels.
// box-shadow (not border) so it never changes layout box size.
const RING = '0 0 0 1.5px rgba(255,255,255,0.16)';

// Renders a preset icon, an uploaded photo, or an initials fallback —
// whichever profiles.avatar_url resolves to.
export default function Avatar({ name, avatarUrl, size = 30, ring = true }: Props) {
  const presetKey = presetKeyOf(avatarUrl);
  const imageSrc = presetKey ? PRESET_SRC[presetKey] : (avatarUrl || undefined);

  if (imageSrc) {
    return (
      <img
        src={imageSrc}
        alt=""
        className="shrink-0 rounded-full select-none object-cover"
        style={{ width: size, height: size, boxShadow: ring ? RING : undefined }}
      />
    );
  }

  return (
    <div
      className="flex items-center justify-center shrink-0 rounded-full select-none"
      style={{
        width: size, height: size,
        background: 'rgba(244,241,236,0.14)',
        color: 'var(--te-text-1)',
        fontSize: size * 0.38, fontWeight: 700, letterSpacing: '-0.02em',
        boxShadow: ring ? RING : undefined,
      }}
    >
      {initials(name)}
    </div>
  );
}
