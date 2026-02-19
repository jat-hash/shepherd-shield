import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Pin, MoreVertical, Check, CheckCheck } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

export default function MessageBubble({ message, isMe, currentUserEmail, onUpdate }) {
  const [hovering, setHovering] = useState(false);

  const handlePin = async () => {
    await base44.entities.TeamMessage.update(message.id, { is_pinned: !message.is_pinned });
    onUpdate?.();
  };

  const readCount = message.read_by?.length || 0;
  const isRead = message.read_by?.includes(currentUserEmail);

  return (
    <div
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      className={`flex gap-3 ${isMe ? "justify-end" : "justify-start"}`}
    >
      <div className={`max-w-[80%] relative ${isMe ? "order-2" : ""}`}>
        {message.is_pinned && (
          <div className="flex items-center gap-1 text-[10px] text-[#d4a843] mb-1">
            <Pin className="w-3 h-3" />
            <span>Pinned</span>
          </div>
        )}
        
        <div className={`rounded-2xl px-4 py-2.5 ${
          isMe
            ? "bg-[#d4a843] text-[#0a1128]"
            : "bg-[#1a2744] text-white border border-[rgba(212,168,67,0.1)]"
        }`}>
          {!isMe && (
            <p className="text-[10px] font-semibold text-[#d4a843] mb-0.5">{message.sender_name}</p>
          )}
          
          {message.attachment && (
            <div className="mb-2">
              {message.message_type === "photo" && message.attachment.match(/\.(jpg|jpeg|png|gif|webp)$/i) ? (
                <img 
                  src={message.attachment} 
                  alt="Shared image" 
                  className="rounded-lg max-w-full max-h-64 object-contain cursor-pointer"
                  onClick={() => window.open(message.attachment, '_blank')}
                />
              ) : message.attachment.match(/\.(mp4|mov|avi|webm)$/i) ? (
                <video 
                  src={message.attachment} 
                  controls 
                  className="rounded-lg max-w-full max-h-64"
                />
              ) : (
                <a 
                  href={message.attachment} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className={`text-xs underline flex items-center gap-1 ${isMe ? "text-[#0a1128]" : "text-[#d4a843]"}`}
                >
                  📎 {message.attachment.split('/').pop()?.split('?')[0] || "Download file"}
                </a>
              )}
            </div>
          )}
          
          <p className="text-sm leading-relaxed">{message.content}</p>
          
          <div className="flex items-center justify-between mt-1 gap-3">
            <p className={`text-[9px] ${isMe ? "text-[#0a1128]/60" : "text-slate-500"}`}>
              {new Date(message.created_date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </p>
            
            {isMe && (
              <div className="flex items-center gap-1">
                {readCount > 0 ? (
                  <>
                    <CheckCheck className="w-3 h-3" />
                    <span className="text-[9px]">{readCount}</span>
                  </>
                ) : (
                  <Check className="w-3 h-3" />
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {hovering && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild className={isMe ? "order-1" : ""}>
            <Button size="icon" variant="ghost" className="h-6 w-6 shrink-0">
              <MoreVertical className="w-3 h-3 text-slate-500" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="bg-[#1a2744] border-slate-700">
            <DropdownMenuItem onClick={handlePin} className="text-white hover:bg-white/10 cursor-pointer">
              <Pin className="w-3 h-3 mr-2" />
              {message.is_pinned ? "Unpin" : "Pin"} Message
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}