import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (user.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const { service_type, service_date, start_time, end_time } = await req.json();

    // Get all active positions marked for auto-rotation
    const positions = await base44.asServiceRole.entities.Position.filter({ is_active: true, auto_rotate: true });
    
    if (positions.length === 0) {
      return Response.json({ 
        success: false, 
        message: "No positions selected for auto-rotation" 
      });
    }

    // Get all users
    const users = await base44.asServiceRole.entities.User.list();
    
    if (users.length === 0) {
      return Response.json({ 
        success: false, 
        message: "No users found" 
      });
    }

    // Check for existing assignments on this date
    const existingAssignments = await base44.asServiceRole.entities.Assignment.filter({ service_date });

    // Get week start and end dates
    const serviceDate = new Date(service_date);
    const weekStart = new Date(serviceDate);
    weekStart.setDate(serviceDate.getDate() - serviceDate.getDay());
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);

    // Get all assignments for this week
    const weekAssignments = await base44.asServiceRole.entities.Assignment.list('-created_date', 500);
    const weekAssignmentsFiltered = weekAssignments.filter(a => {
      const aDate = new Date(a.service_date);
      return aDate >= weekStart && aDate <= weekEnd;
    });

    // Count assignments per user this week
    const userWeekCounts = {};
    weekAssignmentsFiltered.forEach(a => {
      userWeekCounts[a.assigned_to_email] = (userWeekCounts[a.assigned_to_email] || 0) + 1;
    });

    // Get assignment history (last 3 months) for better rotation
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
    const recentAssignments = await base44.asServiceRole.entities.Assignment.list('-created_date', 1000);
    const relevantHistory = recentAssignments.filter(a => new Date(a.service_date) >= threeMonthsAgo);

    // Build user assignment history
    const userHistory = {};
    relevantHistory.forEach(a => {
      if (!userHistory[a.assigned_to_email]) {
        userHistory[a.assigned_to_email] = [];
      }
      userHistory[a.assigned_to_email].push({
        position: a.position_name,
        date: a.service_date,
        service_type: a.service_type
      });
    });

    // Prepare data for AI
    const aiPrompt = `You are an intelligent assignment rotation system for a church security team.

POSITIONS TO FILL (${positions.length} positions):
${positions.map(p => `- ${p.name}: ${p.description || 'No description'}`).join('\n')}

AVAILABLE TEAM MEMBERS (${users.length} users):
${users.map(u => {
  const weekCount = userWeekCounts[u.email] || 0;
  const historyCount = userHistory[u.email]?.length || 0;
  return `- ${u.full_name || u.email} (${u.email}): ${weekCount} assignment(s) this week, ${historyCount} total in last 3 months`;
}).join('\n')}

CONSTRAINTS:
1. NO user should receive more than 1 assignment this week
2. Prioritize users with fewer recent assignments
3. Ensure fair rotation across all team members
4. Consider assignment history for balanced distribution

EXISTING ASSIGNMENTS FOR ${service_date}:
${existingAssignments.map(a => `- ${a.position_name}: ${a.assigned_to_name}`).join('\n') || 'None'}

TASK: Assign each position to a different user. Output ONLY valid JSON (no markdown, no explanation):
{
  "assignments": [
    {
      "position_name": "Position Name",
      "assigned_to_email": "user@email.com",
      "assigned_to_name": "User Full Name",
      "reason": "Brief reason for selection"
    }
  ]
}`;

    // Call AI to generate assignments
    const aiResult = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt: aiPrompt,
      response_json_schema: {
        type: "object",
        properties: {
          assignments: {
            type: "array",
            items: {
              type: "object",
              properties: {
                position_name: { type: "string" },
                assigned_to_email: { type: "string" },
                assigned_to_name: { type: "string" },
                reason: { type: "string" }
              }
            }
          }
        }
      }
    });

    const aiAssignments = aiResult.assignments || [];

    // Create assignments
    const createdAssignments = [];
    for (const assignment of aiAssignments) {
      const position = positions.find(p => p.name === assignment.position_name);
      
      if (position) {
        const newAssignment = await base44.asServiceRole.entities.Assignment.create({
          position_name: assignment.position_name,
          service_date,
          service_type,
          start_time,
          end_time,
          assigned_to_email: assignment.assigned_to_email,
          assigned_to_name: assignment.assigned_to_name,
          supervisor: "",
          radio_channel: position.default_radio_channel || "",
          status: "Pending",
          area_responsibilities: position.area_responsibilities?.join(", ") || "",
          notes: `Auto-assigned by AI: ${assignment.reason}`
        });
        createdAssignments.push(newAssignment);
      }
    }

    return Response.json({
      success: true,
      assignments_created: createdAssignments.length,
      assignments: createdAssignments
    });

  } catch (error) {
    console.error('Auto-rotation error:', error);
    return Response.json({ 
      success: false,
      error: error.message 
    }, { status: 500 });
  }
});