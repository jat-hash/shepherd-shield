import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);

        const now = new Date();
        const today = now.toISOString().split('T')[0];
        const testEmail = 'offline_test@shepherdshield.test';

        // 1. Simulate offline check-in: create a PersonalCheckIn record
        const checkInRecord = await base44.asServiceRole.entities.PersonalCheckIn.create({
            user_email: testEmail,
            user_name: 'Offline Test User',
            check_in_date: today,
            check_in_time: now.toISOString(),
            latitude: 34.0522,
            longitude: -118.2437,
        });

        if (!checkInRecord?.id) throw new Error('Check-in creation failed');

        // 2. Simulate offline check-out: update the record with check_out_time
        const checkOutTime = new Date(now.getTime() + 60000).toISOString(); // 1 min later
        const updated = await base44.asServiceRole.entities.PersonalCheckIn.update(checkInRecord.id, {
            check_out_time: checkOutTime,
        });

        if (!updated?.check_out_time) throw new Error('Check-out update failed');

        // 3. Verify the record looks correct
        const records = await base44.asServiceRole.entities.PersonalCheckIn.filter({
            user_email: testEmail,
            check_in_date: today,
        });

        const found = records.find(r => r.id === checkInRecord.id);

        // 4. Clean up test record
        await base44.asServiceRole.entities.PersonalCheckIn.delete(checkInRecord.id);

        return Response.json({
            success: true,
            tests: {
                check_in_created: !!checkInRecord.id,
                check_out_recorded: !!updated.check_out_time,
                record_queryable: !!found,
                check_in_time: checkInRecord.check_in_time,
                check_out_time: updated.check_out_time,
                latitude: checkInRecord.latitude,
                longitude: checkInRecord.longitude,
            }
        });
    } catch (error) {
        return Response.json({ success: false, error: error.message }, { status: 500 });
    }
});