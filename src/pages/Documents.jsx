import { FileText } from "lucide-react";

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
  return (
    <div className="max-w-3xl mx-auto px-4 py-6 lg:ml-60 space-y-5">
      <div className="flex items-center gap-3">
        <FileText className="w-6 h-6 text-[#d4a843]" />
        <h1 className="text-xl font-bold text-white">Documents</h1>
      </div>
      <p className="text-slate-400 text-sm">Reference guides and flowcharts for the security team.</p>

      <div className="grid gap-5">
        {DOCUMENTS.map((doc) => (
          <div key={doc.id} className="bg-[#1a2744] rounded-xl border border-[rgba(212,168,67,0.1)] overflow-hidden">
            <div className="p-4 border-b border-[rgba(212,168,67,0.08)] flex items-start justify-between gap-3">
              <div>
                <h2 className="text-white font-bold text-sm">{doc.title}</h2>
                <p className="text-slate-400 text-xs mt-1">{doc.description}</p>
              </div>
              <span className={`text-xs px-2 py-1 rounded-full border whitespace-nowrap ${categoryColors[doc.category] || "bg-slate-800 text-slate-400 border-slate-700"}`}>
                {doc.category}
              </span>
            </div>
            <div className="p-4 flex justify-center bg-white/5">
              <img
                src={doc.image_url}
                alt={doc.title}
                className="max-w-full rounded-lg shadow-lg"
                style={{ maxHeight: "80vh", objectFit: "contain" }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}