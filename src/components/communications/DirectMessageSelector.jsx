import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { UserPlus, Search, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cacheData, getCachedData } from "@/lib/offlineStorage";

const USERS_CACHE_KEY = "team_users";

export default function DirectMessageSelector({ currentUserEmail, onSelectDM }) {
  const [open, setOpen] = useState(false);
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState("");
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  useEffect(() => {
    if (open && currentUserEmail) {
      if (!navigator.onLine) {
        // Load from cache when offline
        getCachedData(USERS_CACHE_KEY).then(cached => {
          if (cached) setUsers(cached.filter(u => u.email !== currentUserEmail));
        });
        return;
      }
      base44.functions.invoke("listUsers").then(res => {
        const all = res?.data?.users || [];
        const others = all.filter(u => u.email !== currentUserEmail);
        setUsers(others);
        // Cache the full list for offline use
        cacheData(USERS_CACHE_KEY, all).catch(() => {});
      }).catch(() => {
        // Fallback to cache on error
        getCachedData(USERS_CACHE_KEY).then(cached => {
          if (cached) setUsers(cached.filter(u => u.email !== currentUserEmail));
        });
      });
    }
  }, [open, currentUserEmail]);

  const filteredUsers = users.filter(u =>
    (u.data?.display_name || u.display_name || u.full_name)?.toLowerCase().includes(search.toLowerCase()) ||
    u.email?.toLowerCase().includes(search.toLowerCase())
  );

  const handleSelect = (user) => {
    const dmChannel = `DM: ${[currentUserEmail, user.email].sort().join("-")}`;
    onSelectDM(dmChannel, user);
    setOpen(false);
    setSearch("");
  };

  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        size="sm"
        variant="outline"
        className="border-[#d4a843]/30 text-[#d4a843] hover:bg-[#d4a843]/10 gap-2"
      >
        <UserPlus className="w-3.5 h-3.5" />
        New DM
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-[#1a2744] border-slate-700 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="text-[#d4a843]">Start Direct Message</DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            {isOffline && (
              <div className="flex items-center gap-2 text-xs text-amber-400 bg-amber-900/20 border border-amber-500/20 rounded-lg px-3 py-2">
                <WifiOff className="w-3.5 h-3.5 shrink-0" />
                Offline — showing cached contacts. Messages will send when reconnected.
              </div>
            )}
            <div className="relative">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
              <Input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search team members..."
                className="bg-[#0a1128] border-slate-700 text-white pl-9"
              />
            </div>

            <div className="max-h-[300px] overflow-y-auto space-y-2">
              {filteredUsers.map(user => (
                <button
                  key={user.id}
                  onClick={() => handleSelect(user)}
                  className="w-full text-left bg-[#0a1128] rounded-lg p-3 border border-slate-700 hover:border-[#d4a843]/30 transition-all flex items-center gap-3"
                >
                  <div className="w-10 h-10 rounded-full bg-[#d4a843] flex items-center justify-center text-[#0a1128] font-bold text-sm">
                    {(user.data?.display_name || user.display_name || user.full_name)?.charAt(0) || "U"}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-white">{user.data?.display_name || user.display_name || user.full_name || "Unknown"}</p>
                    <p className="text-xs text-slate-500">{user.email}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}