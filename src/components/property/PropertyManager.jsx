import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { X, Plus, Pencil, Trash2, Check, Lock, AlertTriangle, ChevronUp, ChevronDown } from "lucide-react";
import { toast } from "sonner";

export default function PropertyManager({ onClose, onChanged }) {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      const recs = await base44.entities.PropertyPost.filter({ is_active: true }, "order", 200);
      recs.sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || (a.name || "").localeCompare(b.name || ""));
      setPosts(recs);
    } catch {
      toast.error("Failed to load properties");
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleAdd = async () => {
    const name = newName.trim();
    if (!name) return;
    if (posts.some(p => p.name.toLowerCase() === name.toLowerCase())) {
      toast.error("A property with that name already exists");
      return;
    }
    setBusy(true);
    try {
      await base44.entities.PropertyPost.create({ name, is_active: true, order: posts.length });
      setNewName("");
      toast.success(`Added "${name}"`);
      await load();
      onChanged?.();
    } catch {
      toast.error("Failed to add property");
    } finally {
      setBusy(false);
    }
  };

  const handleSaveEdit = async (id) => {
    const name = editName.trim();
    if (!name) return;
    const post = posts.find(p => p.id === id);
    const oldName = post?.name;
    if (name === oldName) { setEditingId(null); return; }
    if (posts.some(p => p.id !== id && p.name.toLowerCase() === name.toLowerCase())) {
      toast.error("A property with that name already exists");
      return;
    }
    setBusy(true);
    try {
      await base44.entities.PropertyPost.update(id, { name });
      // Propagate rename to all existing check records for this location
      if (oldName && oldName !== name) {
        try {
          await base44.entities.PropertySecurityCheck.updateMany(
            { location_name: oldName },
            { $set: { location_name: name } }
          );
        } catch (err) {
          console.error("Rename propagation failed:", err);
        }
      }
      setEditingId(null);
      toast.success(`Renamed "${oldName}" to "${name}"`);
      await load();
      onChanged?.();
    } catch {
      toast.error("Failed to rename property");
    } finally {
      setBusy(false);
    }
  };

  const handleMove = async (index, dir) => {
    const newIndex = index + dir;
    if (newIndex < 0 || newIndex >= posts.length) return;
    const reordered = [...posts];
    const [moved] = reordered.splice(index, 1);
    reordered.splice(newIndex, 0, moved);
    setPosts(reordered);
    setBusy(true);
    try {
      await base44.entities.PropertyPost.bulkUpdate(
        reordered.map((p, i) => ({ id: p.id, order: i }))
      );
      onChanged?.();
    } catch {
      toast.error("Failed to reorder");
      await load();
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (post) => {
    setBusy(true);
    try {
      await base44.entities.PropertyPost.delete(post.id);
      // Remove all check history for this location so it fully disappears
      try {
        await base44.entities.PropertySecurityCheck.deleteMany({ location_name: post.name });
      } catch (err) {
        console.error("Delete checks failed:", err);
      }
      setConfirmDelete(null);
      toast.success(`Removed "${post.name}"`);
      await load();
      onChanged?.();
    } catch {
      toast.error("Failed to delete property");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
      <div className="bg-[#1a2744] rounded-2xl border border-[rgba(212,168,67,0.2)] w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[rgba(212,168,67,0.1)] sticky top-0 bg-[#1a2744] z-10">
          <div className="flex items-center gap-2">
            <Lock className="w-5 h-5 text-[#d4a843]" />
            <h2 className="text-white font-bold">Manage Properties</h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Add new */}
          <div className="flex gap-2">
            <input
              className="flex-1 bg-[#0a1128] border border-slate-700 rounded-lg px-3 py-2.5 text-white text-sm outline-none focus:border-[#d4a843]/60 placeholder-slate-500"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); handleAdd(); } }}
              placeholder="New property name…"
            />
            <button
              onClick={handleAdd}
              disabled={busy || !newName.trim()}
              className="flex items-center gap-1 bg-[#d4a843] hover:bg-[#e0bb5e] text-[#0a1128] px-3 py-2.5 rounded-lg text-sm font-bold transition-colors disabled:opacity-50"
            >
              <Plus className="w-4 h-4" />
              Add
            </button>
          </div>

          {/* List */}
          {loading ? (
            <p className="text-center text-slate-400 text-sm py-6">Loading…</p>
          ) : posts.length === 0 ? (
            <p className="text-center text-slate-500 text-sm py-6">No properties yet. Add one above.</p>
          ) : (
            <div className="space-y-2">
              {posts.map((post, index) => (
                <div key={post.id} className="bg-[#0a1128]/60 border border-[rgba(212,168,67,0.1)] rounded-lg p-2.5">
                  {editingId === post.id ? (
                    <div className="flex gap-2 items-center">
                      <input
                        autoFocus
                        className="flex-1 bg-[#0a1128] border border-[#d4a843]/50 rounded-lg px-3 py-2 text-white text-sm outline-none"
                        value={editName}
                        onChange={e => setEditName(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === "Enter") { e.preventDefault(); handleSaveEdit(post.id); }
                          if (e.key === "Escape") setEditingId(null);
                        }}
                      />
                      <button
                        onClick={() => handleSaveEdit(post.id)}
                        disabled={busy}
                        className="text-green-400 hover:text-green-300 p-2 disabled:opacity-50"
                        title="Save"
                      >
                        <Check className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        className="text-slate-400 hover:text-white p-2"
                        title="Cancel"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : confirmDelete?.id === post.id ? (
                    <div className="space-y-2">
                      <div className="flex items-start gap-2 text-red-300">
                        <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                        <p className="text-xs">
                          Delete <span className="font-semibold">{post.name}</span> and all of its check history? This cannot be undone.
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setConfirmDelete(null)}
                          disabled={busy}
                          className="flex-1 bg-[#141f3d] hover:bg-[#1a2744] text-slate-300 border border-[rgba(212,168,67,0.15)] py-2 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => handleDelete(post)}
                          disabled={busy}
                          className="flex-1 bg-red-600 hover:bg-red-500 text-white py-2 rounded-lg text-xs font-bold transition-colors disabled:opacity-50"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex flex-col">
                        <button
                          onClick={() => handleMove(index, -1)}
                          disabled={busy || index === 0}
                          className="text-slate-400 hover:text-[#d4a843] disabled:opacity-30 p-0.5"
                          title="Move up"
                        >
                          <ChevronUp className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleMove(index, 1)}
                          disabled={busy || index === posts.length - 1}
                          className="text-slate-400 hover:text-[#d4a843] disabled:opacity-30 p-0.5"
                          title="Move down"
                        >
                          <ChevronDown className="w-4 h-4" />
                        </button>
                      </div>
                      <p className="text-white text-sm font-medium truncate flex-1">{post.name}</p>
                      <button
                        onClick={() => { setEditingId(post.id); setEditName(post.name); }}
                        disabled={busy}
                        className="text-slate-400 hover:text-[#d4a843] p-1.5 disabled:opacity-50"
                        title="Rename"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setConfirmDelete(post)}
                        disabled={busy}
                        className="text-slate-400 hover:text-red-400 p-1.5 disabled:opacity-50"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          <p className="text-xs text-slate-500 pt-1">
            Renaming a property updates all of its past check records. Deleting removes the property and its full history.
          </p>
        </div>
      </div>
    </div>
  );
}