// Users authorized to broadcast church-wide notifications (altar call, church out,
// emergency alerts, team notifications). Admins always allowed.
const LEADERSHIP_EMAILS = [
  "wilbert.ryan@gmail.com",
  "pachecosmailbox@gmail.com",
];

// Users authorized to access the Nursery module (admins always allowed).
const NURSERY_ACCESS_EMAILS = [
  "wilbert.ryan@gmail.com",
  "pachecosmailbox@gmail.com",
  "wintersnorma@yahoo.com",
  "wintersjamesg@hotmail.com",
  "lilskey311@gmail.com",
  "christinescls@gmail.com",
];

// Users restricted to the Nursery module ONLY — no main app access.
const NURSERY_ONLY_EMAILS = [
  "christinescls@gmail.com",
];

export function canAccessMainApp(user) {
  if (!user) return false;
  if (NURSERY_ONLY_EMAILS.includes((user.email || "").toLowerCase())) return false;
  return true;
}

export function canAccessNursery(user) {
  if (!user) return false;
  if (user.role === "admin") return true;
  return NURSERY_ACCESS_EMAILS.includes((user.email || "").toLowerCase());
}

export function canBroadcastNotifications(user) {
  if (!user) return false;
  if (user.role === "admin") return true;
  return LEADERSHIP_EMAILS.includes((user.email || "").toLowerCase());
}