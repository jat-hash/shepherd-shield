import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import ReactMarkdown from "react-markdown";

export default function SOPReference({ category }) {
  const [sops, setSops] = useState([]);
  const [selectedSop, setSelectedSop] = useState(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (category) {
      base44.entities.SOP.filter({ category }).then(setSops).catch(() => {});
    }
  }, [category]);

  if (sops.length === 0) return null;

  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        variant="outline"
        size="sm"
        className="border-[#d4a843]/30 text-[#d4a843] hover:bg-[#d4a843]/10 gap-2"
      >
        <BookOpen className="w-3 h-3" />
        View Related SOP ({sops.length})
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-[#1a2744] border-slate-700 text-white max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-[#d4a843]">Related SOPs - {category}</DialogTitle>
          </DialogHeader>
          
          {!selectedSop ? (
            <div className="space-y-2">
              {sops.map(sop => (
                <button
                  key={sop.id}
                  onClick={() => setSelectedSop(sop)}
                  className="w-full text-left bg-[#0a1128] rounded-lg p-3 border border-slate-700 hover:border-[#d4a843]/30 transition-all"
                >
                  <h3 className="text-sm font-bold text-white">{sop.title}</h3>
                  <p className="text-xs text-slate-400 mt-1">Version {sop.version}</p>
                </button>
              ))}
            </div>
          ) : (
            <div className="space-y-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedSop(null)}
                className="text-slate-400 hover:text-white"
              >
                ← Back to list
              </Button>
              <div className="prose prose-sm prose-invert max-w-none bg-[#0a1128] rounded-xl p-4 border border-slate-700">
                <ReactMarkdown>{selectedSop.content}</ReactMarkdown>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}