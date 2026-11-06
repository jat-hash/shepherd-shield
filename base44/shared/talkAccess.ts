/**
 * Shared authorization helpers for the walkie-talkie backend functions.
 * A channel with empty allow-lists is open to every signed-in team member.
 */

export function isAuthorizedForChannel(user: any, channel: any): boolean {
  const roles = (channel?.allowed_roles || [])
    .map((role: string) => String(role).trim().toLowerCase())
    .filter(Boolean);
  const emails = (channel?.allowed_emails || [])
    .map((email: string) => String(email).trim().toLowerCase())
    .filter(Boolean);

  const roleOk = roles.length === 0 || roles.includes(String(user?.role || '').toLowerCase());
  const emailOk = emails.length === 0 || emails.includes(String(user?.email || '').toLowerCase());
  return roleOk && emailOk;
}