import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LogOut } from "lucide-react";

export default function UserSwitcher({ user }) {
  const [users, setUsers] = useState([]);
  const [impersonatedEmail, setImpersonatedEmail] = useState(null);

  useEffect(() => {
    // Load impersonation state from sessionStorage
    setImpersonatedEmail(sessionStorage.getItem("dev_impersonate_email"));
    
    // Fetch users list
    base44.functions.invoke("listUsers")
      .then(res => {
        console.log("listUsers response:", res);
        const userList = res?.data?.users || res?.users || [];
        console.log("Users loaded:", userList.length, userList);
        setUsers(userList);
      })
      .catch(err => {
        console.error("Failed to load users:", err);
        setUsers([]);
      });
  }, []);

  const handleSwitchUser = async (email) => {
    // Store the override in sessionStorage
    sessionStorage.setItem("dev_impersonate_email", email);
    // Reload page
    window.location.reload();
  };

  const handleClearImpersonate = () => {
    sessionStorage.removeItem("dev_impersonate_email");
    window.location.reload();
  };



  return (
    <div className="flex items-center gap-2">
      <Select value={impersonatedEmail || "__real_user__"} onValueChange={(val) => {
        if (val === "__real_user__") {
          handleClearImpersonate();
        } else {
          handleSwitchUser(val);
        }
      }}>
        <SelectTrigger className="w-48 text-xs bg-slate-800 border-slate-600">
          <SelectValue placeholder="Switch user..." />
        </SelectTrigger>
        <SelectContent className="bg-slate-800 border-slate-600 text-white">
          <SelectItem value="__real_user__" className="text-slate-300">
            Act as real user ({user?.email})
          </SelectItem>
          {users.length === 0 ? (
            <div className="p-2 text-xs text-slate-400">Loading users...</div>
          ) : (
           users.map(u => (
             <SelectItem key={u.email} value={u.email}>
               {u.display_name || u.full_name || u.email}
             </SelectItem>
           ))
          )}
          </SelectContent>
        </SelectContent>
      </Select>
      {impersonatedEmail && (
        <button
          onClick={handleClearImpersonate}
          className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1"
          title="Exit impersonate mode"
        >
          <LogOut className="w-3 h-3" />
          Exit
        </button>
      )}
    </div>
  );
}