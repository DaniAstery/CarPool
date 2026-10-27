/**
 * avatarUtils.js
 * Helpers for resolving user/driver profile photos, initials, and colors across Corridor
 */

const AVATAR_PALETTE = [
  "#059669", // Emerald
  "#2563EB", // Blue
  "#7C3AED", // Violet
  "#D97706", // Amber
  "#0D9488", // Teal
  "#E11D48", // Rose
  "#4F46E5", // Indigo
  "#0891B2", // Cyan
];

/**
 * Normalizes any profile photo URI, resolving relative backend paths to full URLs.
 * Handles:
 *  - Full HTTP / HTTPS URLs (e.g. Cloudinary, AWS S3, Render)
 *  - Relative server paths (e.g. "/uploads/user_1_avatar.jpg" or "uploads/...")
 *  - Data URIs (data:image/...)
 *  - Local file / content URIs (file://, content://)
 *  - Object format { uri: "..." }
 *  - Ignores null, undefined, empty strings, and dummy placeholder services like placehold.co
 */
export const resolvePhotoUrl = (photoUri, customBaseUrl) => {
  if (!photoUri) return null;

  let raw = photoUri;
  if (typeof raw === "object" && raw !== null && raw.uri) {
    raw = raw.uri;
  }

  if (typeof raw !== "string") return null;

  const trimmed = raw.trim();
  if (!trimmed || trimmed.length === 0) return null;

  // Already a full or accessible URL (e.g. Cloudinary, S3, or any remote image stored in users table)
  if (
    trimmed.startsWith("http://") ||
    trimmed.startsWith("https://") ||
    trimmed.startsWith("data:") ||
    trimmed.startsWith("file://") ||
    trimmed.startsWith("content://")
  ) {
    return trimmed;
  }

  // Resolve relative server upload path
  const defaultBase =
    process.env.EXPO_PUBLIC_API_URL || "http://3.223.192.195:5000";
  const rawBase = customBaseUrl || defaultBase;
  const baseUrl = rawBase.replace(/\/api\/?$/, "").replace(/\/$/, "");
  const cleanPath = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;

  return `${baseUrl}${cleanPath}`;
};

/**
 * Extracts 1 or 2 clean initials from a person or rider's name.
 * E.g., "Abebe Kebede" -> "AK", "Rider 14" -> "R", "Dawit" -> "D"
 */
export const getInitials = (name, fallback = "U") => {
  if (!name || typeof name !== "string") return fallback;

  const cleaned = name.trim();
  if (!cleaned) return fallback;

  // Check if it's "Passenger 12" or "Rider 12" -> return "P" or "R"
  const riderMatch = cleaned.match(/^(Rider|Passenger|Driver)\s*#?(\d+)/i);
  if (riderMatch) {
    return riderMatch[1].charAt(0).toUpperCase();
  }

  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return fallback;
  if (parts.length === 1) {
    return parts[0].substring(0, 1).toUpperCase();
  }

  const first = parts[0].charAt(0).toUpperCase();
  const last = parts[parts.length - 1].charAt(0).toUpperCase();
  return `${first}${last}`;
};

/**
 * Deterministically returns a consistent pleasant avatar color based on userId or name
 */
export const getAvatarColor = (idOrName) => {
  if (idOrName === undefined || idOrName === null) {
    return AVATAR_PALETTE[0];
  }

  if (typeof idOrName === "number") {
    return AVATAR_PALETTE[Math.abs(idOrName) % AVATAR_PALETTE.length];
  }

  const str = String(idOrName);
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }

  return AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length];
};
