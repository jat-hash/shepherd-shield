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

    const { week_start } = await req.json();

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

    // Define weekly services with their typical schedule
    const weeklyServices = [
      { day: 0, name: "Sunday AM", start_time: "09:00", end_time: "12:00" },
      { day: 0, name: "Sunday Spanish Services", start_time: "13:00", end_time: "15:00" },
      { day: 0, name: "Sunday PM", start_time: "18:00", end_time: "20:00" },
      { day: 2, name: "Tuesday Bible Study", start_time: "19:00", end_time: "21:00" },
      { day: 3, name: "Wednesday Spanish Bible Study", start_time: "19:00", end_time: "21:00" },
      { day: 4, name: "Thursday Services", start_time: "19:00", end_time: "21:00" },
    ];

    // Get week start and end dates
    const weekStart = new Date(week_start);
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

    // Prepare data for AI - generate for entire week
    const aiPrompt = `You are an intelligent assignment rotation system for a church security team.

POSITIONS TO FILL (${positions.length} positions for EACH service):
${positions.map(p => `- ${p.name}: ${p.description || 'No description'}`).join('\n')}

SERVICES THIS WEEK (${weeklyServices.length} services):
${weeklyServices.map(s => `- ${s.name} (Day ${s.day}, ${s.start_time}-${s.end_time})`).join('\n')}

AVAILABLE TEAM MEMBERS (${users.length} users):
${users.map(u => {
  const weekCount = userWeekCounts[u.email] || 0;
  const historyCount = userHistory[u.email]?.length || 0;
  return `- ${u.full_name || u.email} (${u.email}): ${weekCount} assignment(s) this week, ${historyCount} total in last 3 months`;
}).join('\n')}

CONSTRAINTS:
1. NO user should receive more than 1 assignment this week across ALL services
2. Each service needs all ${positions.length} positions filled
3. Prioritize users with fewer recent assignments
4. Ensure fair rotation across all team members
5. Consider assignment history for balanced distribution

EXISTING ASSIGNMENTS THIS WEEK:
${weekAssignmentsFiltered.map(a => `- ${a.service_type}: ${a.position_name} = ${a.assigned_to_name}`).join('\n') || 'None'}

TASK: Create assignments for ALL services this week (${weeklyServices.length} services × ${positions.length} positions = ${weeklyServices.length * positions.length} assignments). 
Each service must have all positions filled. No user can appear more than once across the entire week.
Output ONLY valid JSON (no markdown, no explanation):
{
  "weekly_assignments": [
    {
      "service_name": "Service Name",
      "assignments": [
        {
          "position_name": "Position Name",
          "assigned_to_email": "user@email.com",
          "assigned_to_name": "User Full Name"
        }
      ]
    }
  ]
}`;

    // Call AI to generate assignments for entire week
    const aiResult = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt: aiPrompt,
      response_json_schema: {
        type: "object",
        properties: {
          weekly_assignments: {
            type: "array",
            items: {
              type: "object",
              properties: {
                service_name: { type: "string" },
                assignments: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      position_name: { type: "string" },
                      assigned_to_email: { type: "string" },
                      assigned_to_name: { type: "string" }
                    }
                  }
                }
              }
            }
          }
        }
      }
    });

    const weeklyAssignments = aiResult.weekly_assignments || [];

    // Create assignments for each service
    const createdAssignments = [];
    for (const serviceAssignment of weeklyAssignments) {
      const serviceInfo = weeklyServices.find(s => s.name === serviceAssignment.service_name);
      
      if (!serviceInfo) continue;

      const serviceDate = new Date(weekStart);
      serviceDate.setDate(weekStart.getDate() + serviceInfo.day);
      const serviceDateStr = serviceDate.toISOString().split('T')[0];

      for (const assignment of serviceAssignment.assignments) {
        const position = positions.find(p => p.name === assignment.position_name);
        
        if (position) {
          const newAssignment = await base44.asServiceRole.entities.Assignment.create({
            position_name: assignment.position_name,
            service_date: serviceDateStr,
            service_type: serviceInfo.name,
            start_time: serviceInfo.start_time,
            end_time: serviceInfo.end_time,
            assigned_to_email: assignment.assigned_to_email,
            assigned_to_name: assignment.assigned_to_name,
            supervisor: "",
            radio_channel: position.default_radio_channel || "",
            status: "Pending",
            area_responsibilities: position.area_responsibilities?.join(", ") || "",
            notes: "Auto-assigned by AI for weekly rotation"
          });
          createdAssignments.push(newAssignment);
        }
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