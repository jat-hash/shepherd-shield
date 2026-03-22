import { useState, useEffect } from "react";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import { base44 } from "@/api/base44Client";
import { MapPin, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

// Fix default leaflet icon broken by bundlers
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png"
});

const checkedInIcon = new L.Icon({
  iconUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-green.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34]
});

const checkedOutIcon = new L.Icon({
  iconUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-blue.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34]
});

export default function TeamLocationMap() {
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [mapCenter, setMapCenter] = useState([34.0522, -118.2437]); // Default LA

  const today = new Date().toISOString().split("T")[0];

  const load = async () => {
    setLoading(true);
    try {
      const all = await base44.entities.Assignment.filter({ service_date: today });
      // Only include those with GPS check-in coords
      const withLocation = all.filter((a) => a.checked_in && a.check_in_latitude && a.check_in_longitude);
      setAssignments(withLocation);
      if (withLocation.length > 0) {
        setMapCenter([withLocation[0].check_in_latitude, withLocation[0].check_in_longitude]);
      }
    } catch (e) {


      // silently fail
    }setLoading(false);};

  useEffect(() => {
    load();
    const unsub = base44.entities.Assignment.subscribe(() => load());
    return unsub;
  }, []);

  const locatedCount = assignments.length;

  return (
    <div className="bg-[#1a2744] rounded-xl border border-[rgba(212,168,67,0.1)] overflow-hidden">
      














      

      {loading ?
      <div className="h-64 flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-[#d4a843] border-t-transparent rounded-full animate-spin" />
        </div> :
      locatedCount === 0 ? null :






      <div className="h-72">
          <MapContainer
          center={mapCenter}
          zoom={14}
          style={{ height: "100%", width: "100%" }}
          scrollWheelZoom={false}>
          
            <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' />
          
            {assignments.map((a) =>
          <Marker
            key={a.id}
            position={[a.check_in_latitude, a.check_in_longitude]}
            icon={a.checked_out ? checkedOutIcon : checkedInIcon}>
            
                <Popup>
                  <div className="text-sm">
                    <p className="font-semibold">{a.assigned_to_name}</p>
                    <p className="text-gray-600">{a.position_name}</p>
                    <p className="text-gray-500 text-xs mt-1">
                      In: {a.check_in_time ? new Date(a.check_in_time).toLocaleTimeString() : "—"}
                    </p>
                    {a.checked_out &&
                <p className="text-gray-500 text-xs">
                        Out: {a.check_out_time ? new Date(a.check_out_time).toLocaleTimeString() : "—"}
                      </p>
                }
                    <span className={`text-xs font-medium ${a.checked_out ? "text-blue-600" : "text-green-600"}`}>
                      {a.checked_out ? "Checked Out" : "On Duty"}
                    </span>
                  </div>
                </Popup>
              </Marker>
          )}
          </MapContainer>
        </div>
      }

      {locatedCount > 0 &&
      <div className="px-4 py-2 border-t border-[rgba(212,168,67,0.1)] flex items-center gap-4 text-xs text-slate-400">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" /> On Duty</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500 inline-block" /> Checked Out</span>
        </div>
      }
    </div>);

}