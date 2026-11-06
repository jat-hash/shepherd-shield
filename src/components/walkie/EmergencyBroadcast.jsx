import React, { useState } from 'react';
import { Siren } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

export default function EmergencyBroadcast({ onBroadcast, disabled }) {
  const [busy, setBusy] = useState(false);

  const handleConfirm = async () => {
    setBusy(true);
    try {
      await onBroadcast();
    } finally {
      setBusy(false);
    }
  };

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          type="button"
          disabled={disabled || busy}
          className="w-full bg-red-600 text-white hover:bg-red-500"
        >
          <Siren className="h-4 w-4" />
          {busy ? 'Broadcasting…' : 'Emergency broadcast'}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent className="bg-[#141f3d] text-white">
        <AlertDialogHeader>
          <AlertDialogTitle>Start an emergency broadcast?</AlertDialogTitle>
          <AlertDialogDescription className="text-slate-300">
            Every authorized team member gets an emergency alert and you are switched to the Emergency
            channel, which takes priority over ordinary channels. Only use this for a real emergency.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="border-white/20 bg-transparent text-slate-200 hover:bg-white/10">
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction className="bg-red-600 text-white hover:bg-red-500" onClick={handleConfirm}>
            Broadcast now
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}