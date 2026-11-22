/**
 * Who counts as active on site: a member holding an open check-in for today.
 * Only active members are joined to a radio channel, so this is the one place
 * that answers that question for the radio functions.
 *
 * Nursery staff are the exception: they are on duty in the nursery rather than
 * on a security post, so they are on the radio without a security check-in.
 */

export const NURSERY_ROLE = 'nursery';

export function isNurseryMember(user: any): boolean {
  return String(user?.role || '').trim().toLowerCase() === NURSERY_ROLE;
}

export function todayKeyPacific(now: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD, the same shape stored on the check-in.
  return now.toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
}

function openFrom(page: any): any[] {
  const records = page?.items || (Array.isArray(page) ? page : []);
  return records.filter((record: any) => record && !record.check_out_time && record.user_email);
}

export async function hasOpenCheckIn(base44: any, email: string): Promise<boolean> {
  const normalized = String(email || '').toLowerCase();
  if (!normalized) return false;
  const page = await base44.asServiceRole.entities.PersonalCheckIn.filter(
    { user_email: normalized, check_in_date: todayKeyPacific() },
    { limit: 20 }
  );
  return openFrom(page).length > 0;
}

export async function openCheckInEmails(base44: any): Promise<Set<string>> {
  const page = await base44.asServiceRole.entities.PersonalCheckIn.filter(
    { check_in_date: todayKeyPacific() },
    { limit: 500 }
  );
  const emails = new Set(
    openFrom(page).map((record: any) => String(record.user_email).toLowerCase())
  );
  // Nursery staff are on duty without a security check-in, so they are on the
  // radio too and must still be alerted when someone talks on their channel.
  const users = await base44.asServiceRole.entities.User.list().catch(() => []);
  (users || [])
    .filter((member: any) => member?.email && isNurseryMember(member))
    .forEach((member: any) => emails.add(String(member.email).toLowerCase()));
  return emails;
}