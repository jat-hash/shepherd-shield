import { useState } from "react";
import { Plus, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default function ChecklistEditor({ items = [], onChange }) {
  const [draft, setDraft] = useState("");

  const add = () => {
    const value = draft.trim();
    if (!value || items.includes(value)) return;
    onChange([...items, value]);
    setDraft("");
  };

  const remove = (task) => onChange(items.filter(t => t !== task));

  return (
    <div className="space-y-2">
      {items.length === 0 && (
        <p className="text-[11px] text-slate-500">No items yet — add what should be checked.</p>
      )}

      {items.map(task => (
        <div
          key={task}
          className="flex items-center gap-2 bg-[#0a1128] border border-slate-700 rounded-lg px-2.5 py-1.5"
        >
          <span className="flex-1 text-[11px] text-slate-300">{task}</span>
          <button
            type="button"
            onClick={() => remove(task)}
            className="text-slate-500 hover:text-red-400 p-0.5"
            aria-label={`Remove ${task}`}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}

      <div className="flex gap-1.5">
        <Input
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
          placeholder="Add a checklist item"
          className="bg-[#0a1128] border-slate-700 text-white text-xs h-9"
        />
        <Button
          type="button"
          onClick={add}
          disabled={!draft.trim()}
          size="sm"
          className="bg-[#d4a843] hover:bg-[#e0bb5e] text-[#0a1128] font-bold h-9 px-2.5"
        >
          <Plus className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}