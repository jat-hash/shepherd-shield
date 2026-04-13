import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const LEADER_NAME_PATTERNS = ['pacheco', 'james lim', 'wilbert ryan'];
const LEADER_ROLES = ['security_chief', 'security chief', 'chief'];

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const payload = await req.json();

    const { event_type, person_name, action, item_name, item_type } = payload;

    // Build the notification message
    let title = '';
    let message = '';

    if (item_type === 'checkin') {
      title = `${action === 'in' ? '✅ Check-In' : '🚪 Check-Out'}: ${person_name}`;
      message = `${person_name} has ${action === 'in' ? 'checked in' : 'checked out'} for their assignment.`;
    } else if (item_type === 'equipment') {
      title = `📦 Equipment ${action === 'out' ? 'Checked Out' : 'Returned'}: ${item_name}`;
      message = `"${item_name}" was ${action === 'out' ? 'checked out by' : 'returned by'} ${person_name || 'a team member'}.`;
    }

    // Find all users matching the leader name patterns
    const allUsers = await base44.asServiceRole.entities.User.list();
    const leaders = allUsers.filter(u => {
      const fullName = (u.full_name || u.display_name || '').toLowerCase();
      const email = (u.email || '').toLowerCase();
      const role = (u.role || '').toLowerCase();
      const nameMatch = LEADER_NAME_PATTERNS.some(pattern =>
        fullName.includes(pattern) || email.includes(pattern)
      );
      const roleMatch = LEADER_ROLES.some(r => role.includes(r));
      return nameMatch || roleMatch;
    });

    if (leaders.length === 0) {
      console.log('No matching leaders found. Users available:', allUsers.map(u => u.full_name || u.email));
      return Response.json({ status: 'no_leaders_found', users: allUsers.map(u => u.full_name) });
    }

    // Send in-app notifications to each leader
    const notifications = leaders.map(leader => ({
      user_email: leader.email,
      title,
      message,
      type: 'general',
      read: false,
    }));

    await Promise.all(
      notifications.map(n => base44.asServiceRole.entities.Notification.create(n))
    );

    console.log(`Notified ${leaders.length} leaders:`, leaders.map(l => l.full_name || l.email));
    return Response.json({ status: 'ok', notified: leaders.map(l => l.full_name || l.email) });
  } catch (error) {
    console.error('notifyLeaders error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});