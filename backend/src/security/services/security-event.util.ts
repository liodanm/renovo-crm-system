/**
 * Masks an email to "j***@example.com" for storage/display in
 * security_events — see SecurityEventsService's own class-level comment
 * for the full reasoning on why the real email is never persisted. Pure
 * function, extracted specifically so this privacy-sensitive
 * transformation has a real, direct, automated test rather than only
 * being exercised indirectly through the service.
 */
export function maskIdentifier(identifier: string): string {
  const at = identifier.indexOf('@');
  if (at <= 0) return '***'; // not a recognizable email shape — mask fully rather than guess
  const local = identifier.slice(0, at);
  const domain = identifier.slice(at);
  return `${local[0]}***${domain}`;
}
