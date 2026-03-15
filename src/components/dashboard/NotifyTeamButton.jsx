import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Bell, Send, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";

export default function NotifyTeamButton({ user }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [selectedEmails, setSelectedEmails] = useState([]);
  const [selectAll, setSelectAll] = useState(true);
  const [sending, setSending] = useState(false);
  const [sendSMS, setSendSMS] = useState(false);
  const [allUsers, setAllUsers] = useState([]);

  const ALLOWED_ROLES = ["admin", "administrator", "security chief", "incident commander"];
  const hasAccess = ALLOWED_ROLES.includes(user?.role?.toLowerCase());

  useEffect(() => {
    if (hasAccess) {
      base44.entities.User.list().then(setAllUsers).catch(() => {});
    }
  }, [user]);

  if (!hasAccess) return null;

  const handleSend = async () => {
    if (!title || !message) return;
    setSending(true);

    const res = await base44.functions.invoke("sendTeamNotification", {
      title,
      message,
      recipient_emails: recipient === "all" ? [] : [recipient],
      send_sms: sendSMS ? true : undefined,
    });

    toast.success(`Notification sent to ${recipient === "all" ? "all members" : recipient}`);
    if (sendSMS && res?.data?.whatsapp_skipped?.length > 0) {
      toast.warning(`WhatsApp skipped for ${res.data.whatsapp_skipped.length} member(s) with no phone number on file.`);
    }
    setSending(false);
    setOpen(false);
    setTitle("");
    setMessage("");
    setRecipient("all");
    setSendSMS(false);
    setPhoneNumber("");
  };

  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        className="w-full bg-blue-600 hover:bg-blue-500 text-white gap-2"
      >
        <Bell className="w-4 h-4" /> Notify Team
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-[#1a2744] border-[rgba(212,168,67,0.2)] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <Bell className="w-5 h-5 text-blue-400" /> Send Team Notification
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label className="text-slate-300">Send To</Label>
              <Select value={recipient} onValueChange={setRecipient}>
                <SelectTrigger className="bg-[#0a1128] border-slate-700 text-white mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#1a2744] border-slate-700">
                  <SelectItem value="all" className="text-white">All Team Members</SelectItem>
                  {allUsers.map(u => (
                    <SelectItem key={u.email} value={u.email} className="text-white">
                      {u.display_name || u.full_name || u.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-slate-300">Title</Label>
              <Input
                placeholder="Notification title..."
                value={title}
                onChange={e => setTitle(e.target.value)}
                className="bg-[#0a1128] border-slate-700 text-white mt-1"
              />
            </div>
            <div>
              <Label className="text-slate-300">Message</Label>
              <Textarea
                placeholder="Write your message..."
                value={message}
                onChange={e => setMessage(e.target.value)}
                className="bg-[#0a1128] border-slate-700 text-white mt-1 min-h-[100px]"
              />
            </div>
            <div className="border border-slate-700 rounded-lg p-3 space-y-3">
              <div className="flex items-center gap-3">
                <Checkbox
                  id="send-sms-dash"
                  checked={sendSMS}
                  onCheckedChange={setSendSMS}
                  className="border-slate-500"
                />
                <label htmlFor="send-sms-dash" className="text-slate-300 text-sm flex items-center gap-2 cursor-pointer">
                  <MessageSquare className="w-4 h-4 text-green-400" /> Also send via SMS & WhatsApp
                </label>
              </div>
              {sendSMS && recipient !== "all" && (
                <div>
                  <Label className="text-slate-400 text-xs">Override phone number (leave blank to use member's saved number)</Label>
                  <Input
                    placeholder="+1234567890"
                    value={phoneNumber}
                    onChange={e => setPhoneNumber(e.target.value)}
                    className="bg-[#0a1128] border-slate-700 text-white mt-1 text-sm"
                  />
                </div>
              )}
              {sendSMS && recipient === "all" && (
                <p className="text-slate-500 text-xs">Will SMS & WhatsApp all members who have a phone number on file.</p>
              )}
            </div>
          </div>
          <div className="flex gap-2 pt-2">
            <Button variant="ghost" onClick={() => setOpen(false)} className="text-slate-400">Cancel</Button>
            <Button
              onClick={handleSend}
              disabled={sending || !title || !message}
              className="flex-1 bg-blue-600 hover:bg-blue-500 text-white gap-2"
            >
              <Send className="w-4 h-4" />
              {sending ? "Sending..." : "Send Notification"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}