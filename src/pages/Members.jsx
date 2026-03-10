import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { User, Search, Mail, Shield, UserPlus, Award, ChevronDown, ChevronUp, Plus, ArrowUp, ArrowDown } from "lucide-react";
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
  const [commandPositions, setCommandPositions] = useState([]);
  const [positionDialogOpen, setPositionDialogOpen] = useState(false);
  const [editingPosition, setEditingPosition] = useState(null);
  const [newPositionTitle, setNewPositionTitle] = useState("");
  const [newPositionDescription, setNewPositionDescription] = useState("");
  const [roleDialogOpen, setRoleDialogOpen] = useState(false);
  const [roles, setRoles] = useState([]);
  const [newRoleName, setNewRoleName] = useState("");
  const [roleToRename, setRoleToRename] = useState(null);
  const [userRoleDialogOpen, setUserRoleDialogOpen] = useState(false);
  const [editingUserRole, setEditingUserRole] = useState(null);
  const [selectedUserRole, setSelectedUserRole] = useState("");

  useEffect(() => {
    loadCurrentUser();
  }, []);

  useEffect(() => {
    if (currentUser) {
      loadUsers();
      loadCommandPositions();
    }
  }, [currentUser]);

  const loadCurrentUser = async () => {
    try {
      const user = await base44.auth.me();
      setCurrentUser(user);
    } catch (error) {
      console.error("Failed to load current user:", error);
      setLoading(false);
    }
  };

  const loadUsers = async () => {
    try {
      const res = await base44.functions.invoke('listUsers');
      const data = res.data?.users || [];
      const formattedUsers = data.map(user => ({
        ...user,
        role: user.role || user.data?.role,
        command_position: user.data?.command_position || user.command_position,
        display_name: user.data?.display_name || user.display_name || user.full_name
      }));
      setUsers(formattedUsers);
      
      // Extract unique roles
      const uniqueRoles = [...new Set(formattedUsers.map(u => u.role).filter(Boolean))];
      setRoles(uniqueRoles);
    } catch (error) {
      console.error("Failed to load users:", error);
      setUsers([]);
    } finally {
      setLoading(false);
    }
  };

  const loadCommandPositions = async () => {
    try {
      const data = await base44.entities.CommandPosition.list("order");
      setCommandPositions(data);
    } catch (error) {
      console.error("Failed to load command positions:", error);
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

  const handleSavePosition = async (e) => {
    e.preventDefault();
    if (!newPositionTitle) return;

    try {
      if (editingPosition) {
        await base44.entities.CommandPosition.update(editingPosition.id, {
          title: newPositionTitle,
          description: newPositionDescription
        });
        toast.success("Position updated");
      } else {
        const maxOrder = commandPositions.length > 0 
          ? Math.max(...commandPositions.map(p => p.order || 0))
          : 0;
        await base44.entities.CommandPosition.create({
          title: newPositionTitle,
          description: newPositionDescription,
          order: maxOrder + 1
        });
        toast.success("Position added");
      }
      setPositionDialogOpen(false);
      setEditingPosition(null);
      setNewPositionTitle("");
      setNewPositionDescription("");
      loadCommandPositions();
    } catch (error) {
      console.error("Failed to save position:", error);
      toast.error("Failed to save position");
    }
  };

  const handleAddRole = async () => {
    if (!newRoleName.trim()) return;
    setRoles([...roles, newRoleName.trim()]);
    setNewRoleName("");
    toast.success("Role added");
  };

  const handleRenameRole = async () => {
    if (!roleToRename || !newRoleName.trim()) return;
    
    try {
      const usersWithRole = users.filter(u => u.role === roleToRename);
      await Promise.all(
        usersWithRole.map(user => 
          base44.entities.User.update(user.id, { role: newRoleName.trim() })
        )
      );
      
      setRoles(roles.map(r => r === roleToRename ? newRoleName.trim() : r));
      setUsers(users.map(u => u.role === roleToRename ? { ...u, role: newRoleName.trim() } : u));
      
      toast.success(`Renamed "${roleToRename}" to "${newRoleName.trim()}"`);
      setRoleToRename(null);
      setNewRoleName("");
    } catch (error) {
      toast.error("Failed to rename role");
    }
  };

  const handleDeleteRole = async (roleName) => {
    const usersWithRole = users.filter(u => u.role === roleName);
    
    if (usersWithRole.length > 0) {
      toast.error(`Cannot delete role "${roleName}" - ${usersWithRole.length} user(s) currently have this role`);
      return;
    }
    
    setRoles(roles.filter(r => r !== roleName));
    toast.success(`Role "${roleName}" removed`);
  };

  const handleAssignUserRole = async () => {
    if (!editingUserRole || !selectedUserRole) return;
    
    try {
      await base44.entities.User.update(editingUserRole.id, {
        role: selectedUserRole
      });
      toast.success("Role updated");
      setUserRoleDialogOpen(false);
      setEditingUserRole(null);
      setSelectedUserRole("");
      loadUsers();
    } catch (error) {
      console.error("Failed to update role:", error);
      toast.error("Failed to update role");
    }
  };

  const handleMovePosition = async (position, direction) => {
    const sorted = [...commandPositions].sort((a, b) => (a.order || 0) - (b.order || 0));
    const idx = sorted.findIndex(p => p.id === position.id);
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= sorted.length) return;

    const swapWith = sorted[swapIdx];
    await Promise.all([
      base44.entities.CommandPosition.update(position.id, { order: swapWith.order }),
      base44.entities.CommandPosition.update(swapWith.id, { order: position.order })
    ]);
    loadCommandPositions();
  };

  const handleDeletePosition = async (positionId) => {
    try {
      await base44.entities.CommandPosition.delete(positionId);
      toast.success("Position deleted");
      loadCommandPositions();
    } catch (error) {
      console.error("Failed to delete position:", error);
      toast.error("Failed to delete position");
    }
  };

  const filteredUsers = users.filter(user =>
    user.display_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
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
                     className="flex-1 border-[#d4a843] text-[#0a1128] hover:bg-[#e0bb5e]"
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
            <div className="flex items-center justify-between">
              <button
                onClick={() => setShowChainOfCommand(!showChainOfCommand)}
                className="flex items-center gap-2 text-left"
              >
                <Award className="w-5 h-5 text-[#d4a843]" />
                <CardTitle className="text-[#d4a843]">Chain of Command</CardTitle>
                {showChainOfCommand ? (
                  <ChevronUp className="w-5 h-5 text-slate-400" />
                ) : (
                  <ChevronDown className="w-5 h-5 text-slate-400" />
                )}
              </button>
              {currentUser?.role === 'admin' && showChainOfCommand && (
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => {
                      setEditingPosition(null);
                      setNewPositionTitle("");
                      setNewPositionDescription("");
                      setPositionDialogOpen(true);
                    }}
                    className="bg-[#d4a843] hover:bg-[#e0bb5e] text-[#0a1128]"
                  >
                    <Plus className="w-4 h-4 mr-1" />
                    Position
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => setRoleDialogOpen(true)}
                    className="bg-[#d4a843] hover:bg-[#e0bb5e] text-[#0a1128]"
                  >
                    <Shield className="w-4 h-4 mr-1" />
                    Roles
                  </Button>
                </div>
              )}
            </div>
          </CardHeader>
          {showChainOfCommand && (
            <CardContent>
              {commandPositions.length === 0 ? (
                <p className="text-slate-400 text-center py-4">No command positions defined yet</p>
              ) : (
                <div className="space-y-3">
                  {commandPositions.map((position) => {
                    const assignedUser = users.find(u => u.command_position === position.title);
                    return (
                      <div key={position.id} className="bg-[#1a2744] rounded-lg p-3 border border-[rgba(212,168,67,0.1)]">
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex-1">
                            <p className="text-sm font-semibold text-[#d4a843]">{position.title}</p>
                            {position.description && (
                              <p className="text-xs text-slate-400 mt-0.5">{position.description}</p>
                            )}
                          </div>
                          {currentUser?.role === 'admin' && (
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                  setEditingPosition(position);
                                  setNewPositionTitle(position.title);
                                  setNewPositionDescription(position.description || "");
                                  setPositionDialogOpen(true);
                                }}
                                className="text-slate-400 hover:text-white hover:bg-white/10"
                              >
                                Edit
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleDeletePosition(position.id)}
                                className="text-red-400 hover:text-red-300 hover:bg-red-900/20"
                              >
                                Delete
                              </Button>
                            </div>
                          )}
                        </div>
                        {assignedUser ? (
                          <div className="flex items-center gap-2 mt-2 p-2 bg-[#0a1128] rounded border border-[rgba(212,168,67,0.1)]">
                            <div className="w-8 h-8 rounded-full bg-[#d4a843] flex items-center justify-center text-[#0a1128] font-bold text-xs flex-shrink-0">
                              {(assignedUser.display_name || assignedUser.full_name)?.charAt(0) || "U"}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-white truncate">
                                {assignedUser.display_name || assignedUser.full_name}
                              </p>
                              <p className="text-xs text-slate-400 truncate">{assignedUser.email}</p>
                            </div>
                            {currentUser?.role === 'admin' && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleRemoveCommand(assignedUser.id)}
                                className="text-slate-400 hover:text-red-400 hover:bg-red-900/20 flex-shrink-0"
                              >
                                Remove
                              </Button>
                            )}
                          </div>
                        ) : (
                          <div className="mt-2 p-2 bg-[#0a1128] rounded border border-[rgba(212,168,67,0.1)] text-center">
                            <p className="text-xs text-slate-500">No member assigned</p>
                            {currentUser?.role === 'admin' && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                  setEditingCommandUser({ position: position.title });
                                  setSelectedCommandPosition(position.title);
                                  setCommandDialogOpen(true);
                                }}
                                className="text-[#d4a843] hover:text-[#e0bb5e] hover:bg-white/5 mt-1"
                              >
                                Assign Member
                              </Button>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
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
                      {(user.display_name || user.full_name)?.charAt(0) || user.email?.charAt(0) || "U"}
                    </div>
                    <div>
                     <CardTitle className="text-white text-base">
                       {user.display_name || user.full_name || "Team Member"}
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
                    {currentUser?.role === 'admin' && currentUser.id !== user.id && (
                    <div className="mt-3 flex gap-2">
                     <Button
                       size="sm"
                       onClick={() => {
                         setEditingUserRole(user);
                         setSelectedUserRole(user.role || "");
                         setUserRoleDialogOpen(true);
                       }}
                       className="flex-1 bg-[#1a2744] border border-[rgba(212,168,67,0.3)] text-[#d4a843] hover:bg-[#d4a843] hover:text-[#0a1128]"
                     >
                       Change Role
                     </Button>
                     <Button
                       size="sm"
                       onClick={() => {
                         setEditingCommandUser(user);
                         setSelectedCommandPosition(user.command_position || "");
                         setCommandDialogOpen(true);
                       }}
                       className="flex-1 bg-[#1a2744] border border-[rgba(212,168,67,0.3)] text-[#d4a843] hover:bg-[#d4a843] hover:text-[#0a1128]"
                     >
                       {user.command_position ? "Change Position" : "Assign Position"}
                     </Button>
                    </div>
                    )}
                    </CardContent>
            </Card>
          ))}
        </div>

        {filteredUsers.length === 0 && users.length > 0 && (
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
            <DialogTitle className="text-[#d4a843]">
              {editingCommandUser?.command_position ? "Change" : "Assign"} Command Position
              {editingCommandUser && ` - ${editingCommandUser.display_name || editingCommandUser.full_name || editingCommandUser.email}`}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-slate-300">Select Position</Label>
              <Select 
                value={selectedCommandPosition} 
                onValueChange={setSelectedCommandPosition}
              >
                <SelectTrigger className="bg-[#0a1128] border-[rgba(212,168,67,0.15)] text-white">
                  <SelectValue placeholder="Choose position" />
                </SelectTrigger>
                <SelectContent className="bg-[#141f3d] border-[rgba(212,168,67,0.15)] text-white max-h-[300px]">
                  {commandPositions.map(pos => (
                    <SelectItem key={pos.id} value={pos.title} className="text-white">
                      {pos.title}
                      {pos.description && (
                        <span className="text-xs text-slate-400 block mt-0.5">
                          {pos.description}
                        </span>
                      )}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            {editingCommandUser?.command_position && (
              <Button
                variant="destructive"
                onClick={() => {
                  handleRemoveCommand(editingCommandUser.id);
                  setCommandDialogOpen(false);
                }}
                className="sm:mr-auto"
              >
                Remove Position
              </Button>
            )}
            <div className="flex gap-2 w-full sm:w-auto">
              <Button
                variant="outline"
                onClick={() => {
                  setCommandDialogOpen(false);
                  setEditingCommandUser(null);
                  setSelectedCommandPosition("");
                }}
                className="flex-1 sm:flex-initial border-[#d4a843] text-[#0a1128] hover:bg-[#e0bb5e]"
              >
                Cancel
              </Button>
              <Button
                onClick={handleAssignCommand}
                disabled={!selectedCommandPosition}
                className="flex-1 sm:flex-initial bg-[#d4a843] hover:bg-[#e0bb5e] text-[#0a1128]"
              >
                {editingCommandUser?.command_position ? "Update" : "Assign"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Assign User Role Dialog */}
      <Dialog open={userRoleDialogOpen} onOpenChange={setUserRoleDialogOpen}>
        <DialogContent className="bg-[#141f3d] border-[rgba(212,168,67,0.15)] text-white">
          <DialogHeader>
            <DialogTitle className="text-[#d4a843]">
              Change Role for {editingUserRole?.display_name || editingUserRole?.full_name || editingUserRole?.email}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-slate-300">Select Role</Label>
              <Select value={selectedUserRole} onValueChange={setSelectedUserRole}>
                <SelectTrigger className="bg-[#0a1128] border-[rgba(212,168,67,0.15)] text-white">
                  <SelectValue placeholder="Choose role" />
                </SelectTrigger>
                <SelectContent className="bg-[#141f3d] border-[rgba(212,168,67,0.15)] text-white">
                  {roles.map(role => (
                    <SelectItem key={role} value={role} className="text-white">
                      {role}
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
                setUserRoleDialogOpen(false);
                setEditingUserRole(null);
                setSelectedUserRole("");
              }}
              className="border-[#d4a843] text-[#0a1128] hover:bg-[#e0bb5e]"
            >
              Cancel
            </Button>
            <Button
              onClick={handleAssignUserRole}
              disabled={!selectedUserRole}
              className="bg-[#d4a843] hover:bg-[#e0bb5e] text-[#0a1128]"
            >
              Update Role
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Manage Roles Dialog */}
      <Dialog open={roleDialogOpen} onOpenChange={setRoleDialogOpen}>
        <DialogContent className="bg-[#1a2744] text-white border-[rgba(212,168,67,0.15)] max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-[#d4a843]">Manage Roles</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="flex gap-2">
              <Input
                placeholder="New role name..."
                value={newRoleName}
                onChange={(e) => setNewRoleName(e.target.value)}
                className="bg-[#0a1128] border-[rgba(212,168,67,0.15)] text-white flex-1"
                onKeyPress={(e) => e.key === 'Enter' && !roleToRename && handleAddRole()}
              />
              {roleToRename ? (
                <>
                  <Button onClick={handleRenameRole} className="bg-[#d4a843] text-[#0a1128] hover:bg-[#e0bb5e]">
                    Rename
                  </Button>
                  <Button onClick={() => { setRoleToRename(null); setNewRoleName(""); }} variant="outline" className="border-[#d4a843] text-[#0a1128] hover:bg-[#e0bb5e]">
                    Cancel
                  </Button>
                </>
              ) : (
                <Button onClick={handleAddRole} className="bg-[#d4a843] text-[#0a1128] hover:bg-[#e0bb5e]">
                  <Plus className="w-4 h-4 mr-2" />
                  Add
                </Button>
              )}
            </div>

            <div className="space-y-2 max-h-96 overflow-y-auto">
              {roles.map(role => {
                const userCount = users.filter(u => u.role === role).length;
                return (
                  <div key={role} className="bg-[#0a1128] p-4 rounded-lg border border-[rgba(212,168,67,0.15)] flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-[#d4a843]">{role}</div>
                      <div className="text-sm text-slate-400">{userCount} member(s)</div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        onClick={() => {
                          setRoleToRename(role);
                          setNewRoleName(role);
                        }}
                        size="sm"
                        variant="outline"
                        className="border-[rgba(212,168,67,0.15)]"
                      >
                        Edit
                      </Button>
                      <Button
                        onClick={() => handleDeleteRole(role)}
                        size="sm"
                        variant="destructive"
                        disabled={userCount > 0}
                      >
                        Delete
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add/Edit Position Dialog */}
      <Dialog open={positionDialogOpen} onOpenChange={setPositionDialogOpen}>
        <DialogContent className="bg-[#141f3d] border-[rgba(212,168,67,0.15)] text-white">
          <DialogHeader>
            <DialogTitle className="text-[#d4a843]">
              {editingPosition ? "Edit Position" : "Add New Position"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSavePosition} className="space-y-4">
            <div>
              <Label className="text-slate-300">Position Title</Label>
              <Input
                type="text"
                placeholder="e.g., Incident Commander"
                value={newPositionTitle}
                onChange={(e) => setNewPositionTitle(e.target.value)}
                className="bg-[#0a1128] border-[rgba(212,168,67,0.15)] text-white"
                required
              />
            </div>
            <div>
              <Label className="text-slate-300">Description (Optional)</Label>
              <Input
                type="text"
                placeholder="Brief description of responsibilities"
                value={newPositionDescription}
                onChange={(e) => setNewPositionDescription(e.target.value)}
                className="bg-[#0a1128] border-[rgba(212,168,67,0.15)] text-white"
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setPositionDialogOpen(false);
                  setEditingPosition(null);
                  setNewPositionTitle("");
                  setNewPositionDescription("");
                }}
                className="border-[#d4a843] text-[#0a1128] hover:bg-[#e0bb5e]"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="bg-[#d4a843] hover:bg-[#e0bb5e] text-[#0a1128]"
              >
                {editingPosition ? "Update" : "Add"} Position
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}