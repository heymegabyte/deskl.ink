import { DISTROS, type DistroId } from '@deskl/shared';

/**
 * An ORIGINAL glossy gradient orb rendered in a distro's signature brand colors — a
 * stylized mark that identifies the distro by its colour, NOT a reproduction of any
 * distro's trademarked logo. Scales crisp at any size.
 */
export function DistroMark({ distro, size = 48 }: { distro: DistroId; size?: number }) {
  const d = DISTROS[distro];
  const gid = `distro-${distro}`;
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <defs>
        <radialGradient id={gid} cx="36%" cy="30%" r="82%">
          <stop offset="0" stopColor={d.color} />
          <stop offset="1" stopColor={d.color2} />
        </radialGradient>
        <radialGradient id={`${gid}-gloss`} cx="35%" cy="26%" r="48%">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.6" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
      </defs>
      {/* colour sphere */}
      <circle cx="24" cy="24" r="20" fill={`url(#${gid})`} />
      {/* glossy top-left highlight */}
      <ellipse cx="19" cy="16" rx="11" ry="8" fill={`url(#${gid}-gloss)`} />
      {/* subtle rim for definition on dark glass */}
      <circle cx="24" cy="24" r="20" fill="none" stroke="#ffffff" strokeOpacity="0.14" strokeWidth="1" />
    </svg>
  );
}
