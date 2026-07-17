import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Send, X } from "lucide-react";
import { toast } from "sonner";

// Same recipients as the original request — Ryan, Pacheco, and all admins
const NURSERY_HELP_RECIPIENTS = [
  "wilbert.ryan@gmail.com",
  "pachecosmailbox@gmail.com",
];

export default function NurseryRequestReply({ request, user, onClose }) {
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [recipientEmails, setRecipientEmails] = useState([]);

  // Resolve the requester's email by matching the `requested_by` name against
  // the User list. Also include the original alert recipients so everyone who
  // was notified sees the reply.
  useEffect(() => {
    const resolve = async () => {
      try {
        const allUsers = await base44.entities.User.list(undefined, 200);
        const requester = allUsers.find(u =>
          (u.display_name || u.full_name || "") === request.requested_by
        );
        const emails = new Set(NURSERY_HELP_RECIPIENTS.map(e => e.toLowerCase()));
        if (user?.email) emails.add(user.email.toLowerCase());
        if (requester?.email) emails.add(requester.email.toLowerCase());
        // Exclude the replier themselves — they don't need their own reply
        emails.delete((user?.email || "").toLowerCase());
        setRecipientEmails(Array.from(emails));
      } catch {
        setRecipientEmails(NURSERY_HELP_RECIPIENTS);
      }
    };
    resolve();
  }, [request, user]);

  const QUICK_REPLIES = [
    "On my way",
    "Be there in 2 minutes",
    "Coming now",
    "Need more info",
  ];

  const send = async (text) => {
    if (!text.trim()) { toast.error("Type a reply first"); return; }
    setSending(true);
    try {
      await base44.entities.NurseryRequest.update(request.id, {
        status: "Acknowledged",
      });
      await base44.functions.invoke("sendTeamNotification", {
        title: `🍼 Nursery Reply: ${request.request_type}`,
        message: `Reply from ${user?.display_name || user?.full_name || user?.email}: ${text.trim()}`,
        recipient_emails: recipientEmails,
        notification_type: "incident",
        click_url: "/NurseryDashboard",
      });
      toast.success("Reply sent");
      onClose();
    } catch {
      toast.error("Failed to send reply");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
      <div className="bg-[#1a2744] rounded-2xl border border-[rgba(212,168,67,0.2)] w-full max-w-sm shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[rgba(212,168,67,0.1)]">
          <h2 className="text-white font-bold text-sm">Reply to Request</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-3">
          <div className="bg-[#0a1128]/50 rounded-lg p-3">
            <p className="text-white font-semibold text-sm">{request.request_type}</p>
            <p className="text-slate-300 text-sm">{request.child_name || "No child specified"}</p>
            {request.message && <p className="text-orange-300 text-xs mt-1">{request.message}</p>}
            <p className="text-slate-400 text-xs mt-1">By {request.requested_by}</p>
          </div>

          <div>
            <label className="text-xs text-slate-400 mb-1.5 block">Quick Reply</label>
            <div className="flex flex-wrap gap-2">
              {QUICK_REPLIES.map(q => (
                <button
                  key={q}
                  onClick={() => send(q)}
                  disabled={sending}
                  className="bg-[#0a1128] border border-slate-700 hover:border-[#d4a843]/50 text-slate-300 text-xs px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs text-slate-400 mb-1 block">Custom Reply</label>
            <textarea
              className="w-full bg-[#0a1128] border border-slate-700 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-[#d4a843]/60 resize-none"
              value={reply}
              onChange={e => setReply(e.target.value)}
              placeholder="Type your reply..."
              rows={2}
            />
          </div>

          <button
            onClick={() => send(reply)}
            disabled={sending || !reply.trim()}
            className="w-full bg-[#d4a843] hover:bg-[#e0bb5e] text-[#0a1128] font-bold py-3 rounded-xl transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <Send className="w-4 h-4" />
            {sending ? "Sending..." : "Send Reply"}
          </button>
        </div>
      </div>
    </div>
  );
}