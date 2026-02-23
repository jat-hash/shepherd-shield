import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { User, Search, Mail, Shield, UserPlus, Award, ChevronDown, ChevronUp } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
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
  const [showChainOfCommand, setShowChainOfCommand] = useState(true);
  const [editingCommandUser, setEditingCommandUser] = useState(null);
  const [commandDialogOpen, setCommandDialogOpen] = useState(false);
  const [selectedCommandPosition, setSelectedCommandPosition] = useState("");

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

  const handleAssignCommand = async () => {
    if (!editingCommandUser || !selectedCommandPosition) return;

    try {
      await base44.entities.User.update(editingCommandUser.id, {
        command_position: selectedCommandPosition
      });
      toast.success("Command position assigned");
      setCommandDialogOpen(false);
      setEditingCommandUser(null);
      setSelectedCommandPosition("");
      loadUsers();
    } catch (error) {
      console.error("Failed to assign command position:", error);
      toast.error("Failed to assign position");
    }
  };

  const handleRemoveCommand = async (userId) => {
    try {
      await base44.entities.User.update(userId, {
        command_position: null
      });
      toast.success("Command position removed");
      loadUsers();
    } catch (error) {
      console.error("Failed to remove command position:", error);
      toast.error("Failed to remove position");
    }
  };

  const commandPositions = [
    "Pastor",
    "Incident Commander",
    "Team Lead Commander",
    "Administrator",
    "Medical Specialist",
    "Head Usher"
  ];

  const commandUsers = users.filter(u => u.command_position);

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

        {/* Chain of Command Section */}
        <Card className="bg-[#141f3d] border-[rgba(212,168,67,0.15)] mb-6">
          <CardHeader>
            <button
              onClick={() => setShowChainOfCommand(!showChainOfCommand)}
              className="flex items-center justify-between w-full text-left"
            >
              <div className="flex items-center gap-2">
                <Award className="w-5 h-5 text-[#d4a843]" />
                <CardTitle className="text-[#d4a843]">Chain of Command</CardTitle>
              </div>
              {showChainOfCommand ? (
                <ChevronUp className="w-5 h-5 text-slate-400" />
              ) : (
                <ChevronDown className="w-5 h-5 text-slate-400" />
              )}
            </button>
          </CardHeader>
          {showChainOfCommand && (
            <CardContent>
              <div className="space-y-3">
                {commandPositions.map((position) => {
                  const assignedUser = users.find(u => u.command_position === position);
                  return (
                    <div key={position} className="flex items-center justify-between bg-[#1a2744] rounded-lg p-3 border border-[rgba(212,168,67,0.1)]">
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-[#d4a843]">{position}</p>
                        {assignedUser ? (
                          <div className="flex items-center gap-2 mt-1">
                            <div className="w-6 h-6 rounded-full bg-[#d4a843] flex items-center justify-center text-[#0a1128] font-bold text-xs">
                              {assignedUser.full_name?.charAt(0) || "U"}
                            </div>
                            <span className="text-sm text-white">{assignedUser.full_name || assignedUser.email}</span>
                          </div>
                        ) : (
                          <p className="text-xs text-slate-500 mt-1">Not assigned</p>
                        )}
                      </div>
                      {currentUser?.role === 'admin' && (
                        <div className="flex gap-2">
                          {assignedUser && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleRemoveCommand(assignedUser.id)}
                              className="text-red-400 hover:text-red-300 hover:bg-red-900/20"
                            >
                              Remove
                            </Button>
                          )}
                          <Button
                            size="sm"
                            onClick={() => {
                              setEditingCommandUser({ position });
                              setSelectedCommandPosition(position);
                              setCommandDialogOpen(true);
                            }}
                            className="bg-[#d4a843]/20 hover:bg-[#d4a843]/30 text-[#d4a843]"
                          >
                            {assignedUser ? "Change" : "Assign"}
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          )}
        </Card>

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
                      <div className="flex flex-wrap gap-1 mt-1">
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
                        {user.command_position && (
                          <Badge className="bg-purple-900/50 text-purple-200 hover:bg-purple-900/50">
                            <Award className="w-3 h-3 mr-1" />
                            {user.command_position}
                          </Badge>
                        )}
                      </div>
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

      {/* Assign Command Position Dialog */}
      <Dialog open={commandDialogOpen} onOpenChange={setCommandDialogOpen}>
        <DialogContent className="bg-[#141f3d] border-[rgba(212,168,67,0.15)] text-white">
          <DialogHeader>
            <DialogTitle className="text-[#d4a843]">Assign {editingCommandUser?.position}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-slate-300">Select Team Member</Label>
              <Select 
                value={editingCommandUser?.id} 
                onValueChange={(userId) => {
                  const user = users.find(u => u.id === userId);
                  setEditingCommandUser({ ...editingCommandUser, ...user });
                }}
              >
                <SelectTrigger className="bg-[#0a1128] border-[rgba(212,168,67,0.15)] text-white">
                  <SelectValue placeholder="Choose member" />
                </SelectTrigger>
                <SelectContent className="bg-[#141f3d] border-[rgba(212,168,67,0.15)] text-white">
                  {users.map(u => (
                    <SelectItem key={u.id} value={u.id} className="text-white">
                      {u.full_name || u.email}
                      {u.command_position && (
                        <span className="text-xs text-slate-400 ml-2">
                          (Currently: {u.command_position})
                        </span>
                      )}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setCommandDialogOpen(false);
                setEditingCommandUser(null);
              }}
              className="border-[rgba(212,168,67,0.15)] text-white hover:bg-[#1a2744]"
            >
              Cancel
            </Button>
            <Button
              onClick={handleAssignCommand}
              disabled={!editingCommandUser?.id}
              className="bg-[#d4a843] hover:bg-[#e0bb5e] text-[#0a1128]"
            >
              Assign Position
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}