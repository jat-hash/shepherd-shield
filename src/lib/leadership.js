// Users authorized to broadcast church-wide notifications (altar call, church out,
// emergency alerts, team notifications). Admins always allowed.
const LEADERSHIP_EMAILS = [
  "wilbert.ryan@gmail.com",
  "pachecosmailbox@gmail.com",
];

export function canAccessMainApp(user) {
  if (!user) return false;
  if (user.role === "admin") return true;
  return LEADERSHIP_EMAILS.includes((user.email || "").toLowerCase());
}

export function canBroadcastNotifications(user) {
  if (!user) return false;
  if (user.role === "admin") return true;
  return LEADERSHIP_EMAILS.includes((user.email || "").toLowerCase());
}