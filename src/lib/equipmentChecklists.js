export const INSPECTION_CHECKLISTS = {
  Radio: [
    "Batteries charged or replaced",
    "Powers on and receives transmissions",
    "Can transmit on the assigned channel",
    "Antenna and belt clip intact",
    "Charging cradle and cables working",
  ],
  "First Aid": [
    "Kit fully stocked",
    "No expired supplies or medications",
    "Bandages and gauze still sealed",
    "Gloves and CPR mask present",
    "Case clean, latched, and labeled",
  ],
  Medical: [
    "AED battery and pads within date",
    "Oxygen tank level and valve checked",
    "Bag valve mask present",
    "Medications and supplies in date",
    "Device clean and functioning",
  ],
  "Safety Gear": [
    "Batteries in lights and devices",
    "Straps, buckles, and hooks intact",
    "No cracks or excessive wear",
    "Clean and ready for use",
  ],
  Camera: [
    "Batteries charged",
    "Records and plays back correctly",
    "Lens and housing clean",
    "Storage space available",
  ],
  Signage: [
    "Sign clean and legible",
    "Properly mounted and visible",
    "No damage or fading",
  ],
  Other: [
    "Batteries or power source checked",
    "Powers on and works as intended",
    "Clean and free of damage",
    "Manual or instructions on hand",
  ],
};

export function checklistForCategory(category) {
  return [...(INSPECTION_CHECKLISTS[category] || INSPECTION_CHECKLISTS.Other)];
}