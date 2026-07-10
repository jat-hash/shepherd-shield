// Users authorized to broadcast church-wide notifications (altar call, church out,
// emergency alerts, team notifications). Admins always allowed.
const LEADERSHIP_EMAILS = [
  "wilbert.ryan@gmail.com",
  "pachecosmailbox@gmail.com",
];

// Regular (non-leadership) members who can access the full app — not locked to Nursery.
const REGULAR_MEMBER_EMAILS = [
  "tamitha4@hotmail.com",
  "mikebt40@hotmail.com",
];

export function canAccessMainApp(user) {
  if (!user) return false;
  if (user.role === "admin") return true;
  const email = (user.email || "").toLowerCase();
  return LEADERSHIP_EMAILS.includes(email) || REGULAR_MEMBER_EMAILS.includes(email);
}

export function canBroadcastNotifications(user) {
  if (!user) return false;
  if (user.role === "admin") return true;
  return LEADERSHIP_EMAILS.includes((user.email || "").toLowerCase());
}