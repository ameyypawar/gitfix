/**
 * Minimal semver comparison helper for the gfix CLI version floor check.
 *
 * Supports the subset of semver used by gfix: MAJOR.MINOR.PATCH with an
 * optional pre-release suffix of the form `-<tag>.<number>`
 * (e.g., `0.1.0-alpha.3`, `0.1.0-alpha.10`).
 *
 * Pre-release ordering follows semver §9: a version with a pre-release
 * identifier has LOWER precedence than the associated normal version
 * (`0.1.0-alpha.3` < `0.1.0`). Within the same numeric base, pre-releases
 * are compared lexicographically on the tag part and then numerically on
 * the revision number.
 */

interface Parsed {
  major: number;
  minor: number;
  patch: number;
  pre: string | null;    // e.g. "alpha"
  preN: number | null;   // e.g. 3 (from "alpha.3")
}

function parse(v: string): Parsed | null {
  // Match MAJOR.MINOR.PATCH(-PRETAG.PRENUM)?
  const m = v.match(/^(\d+)\.(\d+)\.(\d+)(?:-([\w]+)(?:\.(\d+))?)?$/);
  if (!m) return null;
  return {
    major: parseInt(m[1], 10),
    minor: parseInt(m[2], 10),
    patch: parseInt(m[3], 10),
    pre: m[4] ?? null,
    preN: m[5] != null ? parseInt(m[5], 10) : null,
  };
}

/**
 * Returns true if version `a` is >= version `b`.
 *
 * Returns false when either version is unparseable; callers should treat an
 * unparseable version as a floor check failure (warn the user).
 */
export function semverGte(a: string, b: string): boolean {
  const pa = parse(a);
  const pb = parse(b);
  if (!pa || !pb) return false;

  // Compare numeric triple first.
  if (pa.major !== pb.major) return pa.major > pb.major;
  if (pa.minor !== pb.minor) return pa.minor > pb.minor;
  if (pa.patch !== pb.patch) return pa.patch > pb.patch;

  // Same numeric base — apply semver pre-release rules.
  // No pre-release is higher than any pre-release.
  if (pa.pre === null && pb.pre === null) return true;   // equal
  if (pa.pre === null) return true;                      // a is stable, b is pre
  if (pb.pre === null) return false;                     // a is pre, b is stable

  // Both have pre-release; compare tag alphabetically.
  if (pa.pre !== pb.pre) return pa.pre > pb.pre;

  // Same tag — compare the revision number (missing = 0).
  const na = pa.preN ?? 0;
  const nb = pb.preN ?? 0;
  return na >= nb;
}
