import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Radio, LogIn } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import { canAccessMainApp } from '@/lib/leadership';

// Shown once each time the app is opened.
const NOTICE_KEY = 'shepherd-radio-checkin-notice';

const alreadyShown = () => {
  try {
    return sessionStorage.getItem(NOTICE_KEY) === '1';
  } catch (_) {
    return false;
  }
};

const markShown = () => {
  try {
    sessionStorage.setItem(NOTICE_KEY, '1');
  } catch (_) {
    /* private mode */
  }
};

export default function RadioCheckInNotice() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!user || !canAccessMainApp(user)) return;
    if (alreadyShown()) return;
    markShown();
    setOpen(true);
  }, [user]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-sm border-[rgba(212,168,67,0.25)] bg-[#141f3d] text-white">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-bold">
            <Radio className="h-5 w-5 text-[#d4a843]" />
            Radio needs check-in
          </DialogTitle>
          <DialogDescription className="text-xs leading-relaxed text-slate-400">
            The team radio only works while you are checked in. Check in when you arrive on site and the radio
            joins your channel; when you check out it drops off.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-lg border border-[rgba(212,168,67,0.2)] bg-[rgba(212,168,67,0.08)] p-3 text-[11px] leading-relaxed text-[#f0d9a0]">
          <p className="flex items-center gap-1.5 font-semibold">
            <LogIn className="h-3.5 w-3.5" /> Check In is on the Dashboard
          </p>
          <p className="mt-1 text-slate-400">Until then the radio stays locked, so the channel only carries the team on duty.</p>
        </div>

        <Button onClick={() => setOpen(false)} className="w-full bg-[#d4a843] font-bold text-[#0a1128] hover:bg-[#e0bb5e]">
          Got it
        </Button>
      </DialogContent>
    </Dialog>
  );
}