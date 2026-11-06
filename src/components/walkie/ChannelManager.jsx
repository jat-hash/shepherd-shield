import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import ChannelAccessEditor from './ChannelAccessEditor';

const formForChannel = (channel) => {
  if (!channel) return { name: '', description: '', mode: 'everyone', emails: [] };
  const emails = channel.allowed_emails || [];
  const roles = channel.allowed_roles || [];
  const mode = emails.length
    ? roles.length
      ? 'admins_plus'
      : 'selected'
    : roles.length
    ? 'admins'
    : 'everyone';
  return { name: channel.name || '', description: channel.description || '', mode, emails };
};

export default function ChannelManager({ open, channels, onOpenChange, onSaved }) {
  const [users, setUsers] = useState([]);
  const [channelId, setChannelId] = useState(null);
  const [form, setForm] = useState(formForChannel(null));
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);

  const channel = creating ? null : channels.find((item) => item.id === channelId) || null;

  useEffect(() => {
    if (!open) return;
    base44.entities.User.list()
      .then((rows) => setUsers(Array.isArray(rows) ? rows : rows?.items || []))
      .catch(() => setUsers([]));
    setCreating(false);
    const starting = channels.find((item) => item.id === channelId) || channels[0] || null;
    setChannelId(starting?.id || null);
    setForm(formForChannel(starting));
  }, [open]);

  const selectChannel = (next) => {
    setCreating(false);
    setChannelId(next.id);
    setForm(formForChannel(next));
  };

  const startNewChannel = () => {
    setCreating(true);
    setChannelId(null);
    setForm(formForChannel(null));
  };

  const save = async () => {
    const name = form.name.trim();
    if (!name) {
      toast.error('Give the channel a name');
      return;
    }
    const withMembers = form.mode === 'selected' || form.mode === 'admins_plus';
    const withAdmins = form.mode === 'admins' || form.mode === 'admins_plus';
    const payload = {
      name,
      description: form.description,
      allowed_roles: withAdmins ? ['admin'] : [],
      allowed_emails: withMembers ? form.emails : [],
    };

    setSaving(true);
    try {
      if (creating) {
        await base44.entities.TalkChannel.create({
          ...payload,
          order: channels.length,
          is_active: true,
        });
        toast.success(`${name} created`);
      } else if (channel) {
        await base44.entities.TalkChannel.update(channel.id, payload);
        toast.success(`${name} updated`);
      }
      await onSaved?.();
      onOpenChange(false);
    } catch (_) {
      toast.error(creating ? 'Could not create that channel' : 'Could not save that channel');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto border-white/10 bg-[#141f3d] text-white sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-sm font-bold uppercase tracking-[0.16em] text-[#d4a843]">
            Manage channels
          </DialogTitle>
        </DialogHeader>

        <div className="flex gap-2 overflow-x-auto pb-1">
          <button
            type="button"
            onClick={startNewChannel}
            className={`flex items-center gap-1 whitespace-nowrap rounded-full border px-3 py-1.5 text-[11px] font-semibold ${
              creating
                ? 'border-[#d4a843] bg-[#d4a843] text-[#0a1128]'
                : 'border-dashed border-white/25 bg-transparent text-slate-300'
            }`}
          >
            <Plus className="h-3 w-3" /> New
          </button>
          {channels.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => selectChannel(item)}
              className={`whitespace-nowrap rounded-full border px-3 py-1.5 text-[11px] font-semibold ${
                item.id === channelId
                  ? 'border-[#d4a843] bg-[#d4a843] text-[#0a1128]'
                  : 'border-white/15 bg-white/5 text-slate-300'
              }`}
            >
              {item.name}
            </button>
          ))}
        </div>

        {(creating || channel) && (
          <div className="space-y-3">
            <div>
              <Label className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Name</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                className="mt-1 border-white/15 bg-[#0a1128] text-sm text-white"
              />
            </div>
            <div>
              <Label className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">
                Description
              </Label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                rows={2}
                className="mt-1 border-white/15 bg-[#0a1128] text-sm text-white"
              />
            </div>

            <ChannelAccessEditor
              mode={form.mode}
              onModeChange={(mode) => setForm((prev) => ({ ...prev, mode }))}
              emails={form.emails}
              onEmailsChange={(emails) => setForm((prev) => ({ ...prev, emails }))}
              users={users}
            />

            <Button
              type="button"
              onClick={save}
              disabled={saving}
              className="w-full bg-[#d4a843] font-bold text-[#0a1128] hover:bg-[#e0bb5e]"
            >
              {saving ? 'Saving…' : creating ? 'Create channel' : 'Save channel'}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}