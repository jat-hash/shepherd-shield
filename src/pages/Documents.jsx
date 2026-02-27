import { useState } from "react";
import { FileText, ChevronDown, ChevronUp } from "lucide-react";

const DOCUMENTS = [
  {
    id: "medical-emergency-flowchart",
    title: "Church Medical Emergency Flowchart",
    description: "Step-by-step visual guide for responding to medical emergencies during church services.",
    category: "Medical Response",
    image_url: "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/699778b133b0b54bbf2b985e/66e0cbc96_emergencyguide.png",
  },
];

const categoryColors = {
  "Medical Response": "bg-red-900/30 text-red-400 border-red-700/30",
  "General Security": "bg-blue-900/30 text-blue-400 border-blue-700/30",
  "Emergency Evacuation": "bg-orange-900/30 text-orange-400 border-orange-700/30",
};

export default function Documents() {
  const [expanded, setExpanded] = useState({});

  const toggle = (id) => setExpanded(prev => ({ ...prev, [id]: !prev[id] }));

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 lg:ml-60 space-y-5">
      <div className="flex items-center gap-3">
        <FileText className="w-6 h-6 text-[#d4a843]" />
        <h1 className="text-xl font-bold text-white">Documents</h1>
      </div>
      <p className="text-slate-400 text-sm">Reference guides and flowcharts for the security team.</p>

      <div className="grid gap-3">
        {DOCUMENTS.map((doc) => (
          <div key={doc.id} className="bg-[#1a2744] rounded-xl border border-[rgba(212,168,67,0.1)] overflow-hidden">
            <button
              onClick={() => toggle(doc.id)}
              className="w-full p-4 flex items-center justify-between gap-3 hover:bg-white/5 transition-colors text-left"
            >
              <div className="flex items-start gap-3 flex-1">
                <FileText className="w-4 h-4 text-[#d4a843] mt-0.5 flex-shrink-0" />
                <div>
                  <h2 className="text-white font-semibold text-sm">{doc.title}</h2>
                  <p className="text-slate-400 text-xs mt-0.5">{doc.description}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className={`text-xs px-2 py-1 rounded-full border whitespace-nowrap hidden sm:inline ${categoryColors[doc.category] || "bg-slate-800 text-slate-400 border-slate-700"}`}>
                  {doc.category}
                </span>
                {expanded[doc.id] ? (
                  <ChevronUp className="w-4 h-4 text-slate-400" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-slate-400" />
                )}
              </div>
            </button>

            {expanded[doc.id] && (
              <div className="p-4 pt-0 flex justify-center bg-white/5 border-t border-[rgba(212,168,67,0.08)]">
                <img
                  src={doc.image_url}
                  alt={doc.title}
                  className="max-w-full rounded-lg shadow-lg mt-4"
                  style={{ maxHeight: "80vh", objectFit: "contain" }}
                />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}