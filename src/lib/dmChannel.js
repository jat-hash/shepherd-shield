/**
 * Shared DM channel helpers so pages can build a DM channel name from two emails
 * without each file reimplementing the sorting logic.
 */

// Build the standardized "DM: email1-email2" channel name (alphabetical order).
export function getDMChannelName(emailA, emailB) {
  if (!emailA || !emailB) return "";
  const [a, b] = [emailA, emailB].sort();
  return `DM: ${a}-${b}`;
}

// Extract the "other" email from a DM channel name given the current user's email.
export function getOtherEmail(dmChannel, currentUserEmail) {
  if (!dmChannel) return "";
  const withoutPrefix = dmChannel.replace("DM: ", "");
  return withoutPrefix.split("-").find(e => e !== currentUserEmail && e.includes("@")) || "";
}