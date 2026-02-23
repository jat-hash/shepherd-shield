import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { User, Search, Mail, Shield, UserPlus } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

export default function Members() {
  const [users, setUsers] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("user");
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);

  useEffect(() => {
    loadUsers();
    loadCurrentUser();
  }, []);

  const loadCurrentUser = async () => {
    try {
      const user = await base44.auth.me();
      setCurrentUser(user);
    } catch (error) {
      console.error("Failed to load current user:", error);
    }
  };

  const loadUsers = async () => {
    try {
      const data = await base44.entities.User.list();
      setUsers(data);
    } catch (error) {
      console.error("Failed to load users:", error);
      toast.error("Failed to load team members");
    } finally {
      setLoading(false);
    }
  };

  const handleInvite = async (e) => {
    e.preventDefault();
    if (!inviteEmail) return;

    try {
      await base44.users.inviteUser(inviteEmail, inviteRole);
      toast.success(`Invitation sent to ${inviteEmail}`);
      setInviteEmail("");
      setInviteRole("user");
      setInviteDialogOpen(false);
    } catch (error) {
      console.error("Failed to invite user:", error);
      toast.error("Failed to send invitation");
    }
  };

  const filteredUsers = users.filter(user =>
    user.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a1128] text-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#d4a843] mx-auto mb-4"></div>
          <p className="text-slate-400">Loading team members...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a1128] text-white p-4 lg:pl-60">
      <div className="max-w-6xl mx-auto py-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
          <div>
            <h1 className="text-3xl font-bold text-[#d4a843] flex items-center gap-2">
              <User className="w-8 h-8" />
              Team Members
            </h1>
            <p className="text-slate-400 mt-1">{users.length} active members</p>
          </div>

          {currentUser?.role === 'admin' && (
            <Dialog open={inviteDialogOpen} onOpenChange={setInviteDialogOpen}>
              <DialogTrigger asChild>
                <Button className="bg-[#d4a843] hover:bg-[#e0bb5e] text-[#0a1128] gap-2">
                  <UserPlus className="w-4 h-4" />
                  Invite Member
                </Button>
              </DialogTrigger>
              <DialogContent className="bg-[#141f3d] border-[rgba(212,168,67,0.15)] text-white">
                <DialogHeader>
                  <DialogTitle className="text-[#d4a843]">Invite New Member</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleInvite} className="space-y-4">
                  <div>
                    <Label className="text-slate-300">Email Address</Label>
                    <Input
                      type="email"
                      placeholder="member@example.com"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      className="bg-[#0a1128] border-[rgba(212,168,67,0.15)] text-white"
                      required
                    />
                  </div>
                  <div>
                    <Label className="text-slate-300">Role</Label>
                    <Select value={inviteRole} onValueChange={setInviteRole}>
                      <SelectTrigger className="bg-[#0a1128] border-[rgba(212,168,67,0.15)] text-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-[#141f3d] border-[rgba(212,168,67,0.15)] text-white">
                        <SelectItem value="user">Team Member</SelectItem>
                        <SelectItem value="admin">Administrator</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex gap-3 pt-4">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setInviteDialogOpen(false)}
                      className="flex-1 border-[rgba(212,168,67,0.15)] text-white hover:bg-[#1a2744]"
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      className="flex-1 bg-[#d4a843] hover:bg-[#e0bb5e] text-[#0a1128]"
                    >
                      Send Invitation
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          )}
        </div>

        {/* Search */}
        <div className="mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-slate-400" />
            <Input
              type="text"
              placeholder="Search members by name or email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 bg-[#141f3d] border-[rgba(212,168,67,0.15)] text-white placeholder:text-slate-500"
            />
          </div>
        </div>

        {/* Members Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredUsers.map((user) => (
            <Card
              key={user.id}
              className="bg-[#141f3d] border-[rgba(212,168,67,0.15)] hover:border-[#d4a843] transition-all"
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-[#d4a843] flex items-center justify-center text-[#0a1128] font-bold text-lg">
                      {user.full_name?.charAt(0) || user.email?.charAt(0) || "U"}
                    </div>
                    <div>
                      <CardTitle className="text-white text-base">
                        {user.full_name || "Team Member"}
                      </CardTitle>
                      {user.role && (
                        <Badge
                          className={
                            user.role === "admin"
                              ? "bg-[#d4a843] text-[#0a1128] hover:bg-[#e0bb5e]"
                              : "bg-[#1a2744] text-slate-300 hover:bg-[#1a2744]"
                          }
                        >
                          {user.role === "admin" ? (
                            <>
                              <Shield className="w-3 h-3 mr-1" />
                              Admin
                            </>
                          ) : (
                            "Member"
                          )}
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2 text-slate-400 text-sm">
                  <Mail className="w-4 h-4" />
                  <span className="truncate">{user.email}</span>
                </div>
                {user.created_date && (
                  <p className="text-xs text-slate-500 mt-2">
                    Joined {new Date(user.created_date).toLocaleDateString()}
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        {filteredUsers.length === 0 && (
          <div className="text-center py-12">
            <User className="w-16 h-16 text-slate-600 mx-auto mb-4" />
            <p className="text-slate-400">No members found</p>
            <p className="text-slate-500 text-sm mt-1">
              {searchTerm ? "Try a different search term" : "Invite team members to get started"}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}