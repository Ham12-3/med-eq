// Reference data for the fictional Northbrook General Hospital.
// Every name here is generic or invented: no real manufacturers, products or people.
// Test limits are typical BS EN 62353 values for synthetic data only.

export const SYSTEM_USER_ID = "00000000-0000-4000-8000-000000000001";

export const DEPARTMENTS = [
  { code: "ED", name: "Emergency Department" },
  { code: "AMU", name: "Acute Medical Unit" },
  { code: "ICU", name: "Critical Care" },
  { code: "SURG", name: "Surgery and Theatres" },
  { code: "OPD", name: "Outpatients" },
  { code: "EBME", name: "Clinical Engineering (EBME)" },
  { code: "LIB", name: "Equipment Library" },
] as const;

export type DeptCode = (typeof DEPARTMENTS)[number]["code"];

export const SITE = { name: "Northbrook General Hospital", locationRef: 1 };

type RoomType = "ward" | "single_room" | "store_room" | "equipment_library" | "workshop" | "theatre" | "other";
export type RoomSpec = { key: string; name: string; type: RoomType; dept: DeptCode };
export type FloorSpec = { level: number; name: string; locationRefBase: number; rooms: RoomSpec[] };
export type BuildingSpec = { code: string; name: string; floors: FloorSpec[] };

// Rooms are listed in corridor order; the seed alternates them north and south.
export const BUILDINGS: BuildingSpec[] = [
  {
    code: "MAIN",
    name: "Main Building",
    floors: [
      {
        level: 0,
        name: "Ground floor",
        locationRefBase: 10_000,
        rooms: [
          { key: "ed-triage", name: "ED Triage", type: "single_room", dept: "ED" },
          { key: "ed-majors", name: "ED Majors", type: "ward", dept: "ED" },
          { key: "ed-resus", name: "ED Resus", type: "ward", dept: "ED" },
          { key: "ed-cubicle-1", name: "ED Cubicle 1", type: "single_room", dept: "ED" },
          { key: "ed-cubicle-2", name: "ED Cubicle 2", type: "single_room", dept: "ED" },
          { key: "ed-cubicle-3", name: "ED Cubicle 3", type: "single_room", dept: "ED" },
          { key: "ed-store", name: "ED Equipment Store", type: "store_room", dept: "ED" },
          { key: "amu-bay-a", name: "AMU Bay A", type: "ward", dept: "AMU" },
          { key: "amu-bay-b", name: "AMU Bay B", type: "ward", dept: "AMU" },
          { key: "amu-side-1", name: "AMU Side Room 1", type: "single_room", dept: "AMU" },
          { key: "amu-side-2", name: "AMU Side Room 2", type: "single_room", dept: "AMU" },
          { key: "amu-store", name: "AMU Store", type: "store_room", dept: "AMU" },
          { key: "discharge-lounge", name: "Discharge Lounge", type: "ward", dept: "AMU" },
          { key: "library", name: "Equipment Library", type: "equipment_library", dept: "LIB" },
          { key: "ebme-workshop", name: "EBME Workshop", type: "workshop", dept: "EBME" },
          { key: "ebme-store", name: "EBME Store", type: "store_room", dept: "EBME" },
        ],
      },
      {
        level: 1,
        name: "First floor",
        locationRefBase: 11_000,
        rooms: [
          { key: "icu-bay-1", name: "ICU Bay 1", type: "ward", dept: "ICU" },
          { key: "icu-bay-2", name: "ICU Bay 2", type: "ward", dept: "ICU" },
          { key: "icu-side-1", name: "ICU Side Room 1", type: "single_room", dept: "ICU" },
          { key: "icu-side-2", name: "ICU Side Room 2", type: "single_room", dept: "ICU" },
          { key: "icu-side-3", name: "ICU Side Room 3", type: "single_room", dept: "ICU" },
          { key: "icu-store", name: "ICU Store", type: "store_room", dept: "ICU" },
          { key: "theatre-1", name: "Theatre 1", type: "theatre", dept: "SURG" },
          { key: "theatre-2", name: "Theatre 2", type: "theatre", dept: "SURG" },
          { key: "recovery", name: "Theatre Recovery", type: "ward", dept: "SURG" },
          { key: "surg-ward-a", name: "Surgical Ward A", type: "ward", dept: "SURG" },
          { key: "surg-ward-b", name: "Surgical Ward B", type: "ward", dept: "SURG" },
          { key: "surg-side-1", name: "Surgical Side Room 1", type: "single_room", dept: "SURG" },
          { key: "surg-side-2", name: "Surgical Side Room 2", type: "single_room", dept: "SURG" },
          { key: "surg-store", name: "Surgical Store", type: "store_room", dept: "SURG" },
        ],
      },
    ],
  },
  {
    code: "OPD",
    name: "Outpatients Building",
    floors: [
      {
        level: 0,
        name: "Ground floor",
        locationRefBase: 20_000,
        rooms: [
          { key: "opd-waiting", name: "Outpatients Waiting Area", type: "other", dept: "OPD" },
          { key: "opd-clinic-1", name: "Clinic Room 1", type: "single_room", dept: "OPD" },
          { key: "opd-clinic-2", name: "Clinic Room 2", type: "single_room", dept: "OPD" },
          { key: "opd-clinic-3", name: "Clinic Room 3", type: "single_room", dept: "OPD" },
          { key: "opd-clinic-4", name: "Clinic Room 4", type: "single_room", dept: "OPD" },
          { key: "cardiology", name: "Cardiology Clinic", type: "single_room", dept: "OPD" },
          { key: "phlebotomy", name: "Phlebotomy", type: "other", dept: "OPD" },
          { key: "dressing", name: "Dressing Clinic", type: "single_room", dept: "OPD" },
          { key: "day-unit", name: "Day Treatment Unit", type: "ward", dept: "OPD" },
          { key: "opd-store", name: "Outpatients Store", type: "store_room", dept: "OPD" },
        ],
      },
    ],
  },
];

// ---------- users ----------
export const USER_PLAN: { role: "technician" | "manager" | "ward" | "library" | "admin"; dept: DeptCode; count: number }[] = [
  { role: "technician", dept: "EBME", count: 5 },
  { role: "manager", dept: "EBME", count: 1 },
  { role: "admin", dept: "EBME", count: 1 }, // the MDSO
  { role: "ward", dept: "ED", count: 1 },
  { role: "ward", dept: "AMU", count: 1 },
  { role: "ward", dept: "ICU", count: 1 },
  { role: "ward", dept: "SURG", count: 1 },
  { role: "ward", dept: "OPD", count: 1 },
  { role: "library", dept: "LIB", count: 2 },
];

// ---------- device models and their tests ----------
export type MeasurementSpec = {
  kind: "measurement";
  code: string;
  name: string;
  unit: string;
  lower?: number;
  upper?: number;
  typical: [number, number]; // range a passing device reads in
  fail: number; // a reading that fails
  decimals: number;
  required?: boolean;
};
export type CheckSpec = { kind: "check"; code: string; name: string; required?: boolean };
export type TestSpec = MeasurementSpec | CheckSpec;

export type ElectricalSpec = { class: "I" | "II"; appliedPart: "BF" | "CF" | null };

export type DeviceModelSpec = {
  slug: string;
  code: string; // 3 letters, used in GIAIs
  name: string;
  manufacturer: string;
  category: "life_support" | "resuscitation" | "infusion" | "monitoring" | "diagnostic" | "therapy" | "patient_handling" | "test_equipment";
  intervalMonths: number;
  intervalReason?: string;
  em: [fn: number, risk: number, maintenance: number];
  sizeCm: [w: number, d: number, h: number];
  count: number;
  lifespanYears: number;
  pricePounds: [number, number];
  serialPrefix: string;
  firmware?: string[]; // oldest to newest
  electrical: ElectricalSpec | null;
  performance: TestSpec[];
  placement: [roomKey: string, weight: number][];
  owner: DeptCode | "room"; // "room" = the department of the room it is placed in
  failuresPerYear: number;
  faults: string[];
  parts: { partNumber: string; description: string }[];
  isTestEquipment?: boolean;
};

const check = (code: string, name: string, required = true): CheckSpec => ({ kind: "check", code, name, required });

const NIBP: MeasurementSpec = { kind: "measurement", code: "NIBP", name: "NIBP static pressure error at 150 mmHg", unit: "mmHg", lower: -3, upper: 3, typical: [-1.5, 1.5], fail: 5.2, decimals: 1 };
const SPO2: MeasurementSpec = { kind: "measurement", code: "SPO2", name: "SpO2 reading with 97 % simulator", unit: "%", lower: 95, upper: 99, typical: [96, 98], fail: 92, decimals: 0 };

export const DEVICE_MODELS: DeviceModelSpec[] = [
  {
    slug: "ventilator", code: "VEN", name: "Critical care ventilator CV-800", manufacturer: "Halvard Clinical",
    category: "life_support", intervalMonths: 6, em: [10, 5, 5], sizeCm: [55, 60, 145], count: 18,
    lifespanYears: 10, pricePounds: [18_000, 32_000], serialPrefix: "CV8-", firmware: ["4.2.0", "4.5.1", "5.0.0"],
    electrical: { class: "I", appliedPart: "BF" },
    performance: [
      { kind: "measurement", code: "TV", name: "Tidal volume error at 500 mL", unit: "%", lower: -10, upper: 10, typical: [-5, 5], fail: 14.5, decimals: 1 },
      { kind: "measurement", code: "O2", name: "Delivered oxygen error at 60 %", unit: "% O2", lower: -3, upper: 3, typical: [-1.5, 1.5], fail: 4.8, decimals: 1 },
      check("HPA", "High pressure alarm"),
      check("DISC", "Disconnect alarm"),
      check("BATT", "Internal battery switchover", false),
    ],
    placement: [["icu-bay-1", 5], ["icu-bay-2", 5], ["icu-side-1", 1], ["icu-side-2", 1], ["icu-side-3", 1], ["ed-resus", 2], ["theatre-1", 1], ["theatre-2", 1], ["recovery", 1]],
    owner: "ICU", failuresPerYear: 0.4,
    faults: ["Fails power-on self-test", "Flow sensor error", "Alarm sounding without cause", "Touchscreen unresponsive"],
    parts: [{ partNumber: "CV8-FS-01", description: "Flow sensor" }, { partNumber: "CV8-OC-02", description: "Oxygen cell" }, { partNumber: "CV8-BAT-01", description: "Internal battery pack" }],
  },
  {
    slug: "defibrillator", code: "DEF", name: "Monitor defibrillator DM-400", manufacturer: "Quillon Devices",
    category: "resuscitation", intervalMonths: 12, em: [10, 5, 4], sizeCm: [32, 28, 30], count: 20,
    lifespanYears: 10, pricePounds: [9_000, 16_000], serialPrefix: "DM4-", firmware: ["6.1", "6.3"],
    electrical: { class: "I", appliedPart: "CF" },
    performance: [
      { kind: "measurement", code: "NRG", name: "Delivered energy at 200 J setting", unit: "J", lower: 170, upper: 230, typical: [188, 212], fail: 154, decimals: 0 },
      { kind: "measurement", code: "CHG", name: "Charge time to maximum energy", unit: "s", upper: 10, typical: [5.5, 8.5], fail: 13.2, decimals: 1 },
      check("ECG", "ECG display and heart rate count"),
      check("SYNC", "Synchronised cardioversion"),
      check("SELF", "Daily self-test passes"),
    ],
    placement: [["ed-majors", 1], ["ed-resus", 2], ["amu-bay-a", 1], ["amu-bay-b", 1], ["discharge-lounge", 1], ["icu-bay-1", 1], ["icu-bay-2", 1], ["theatre-1", 1], ["theatre-2", 1], ["recovery", 1], ["surg-ward-a", 1], ["surg-ward-b", 1], ["day-unit", 1], ["opd-waiting", 1], ["cardiology", 1], ["library", 1]],
    owner: "room", failuresPerYear: 0.15,
    faults: ["Fails daily self-test", "Will not charge", "Paddle cable damaged", "Printer not working"],
    parts: [{ partNumber: "DM4-BAT-02", description: "Battery pack" }, { partNumber: "DM4-PC-01", description: "Therapy cable" }, { partNumber: "DM4-PR-01", description: "Printer module" }],
  },
  {
    slug: "volumetric-infusion-pump", code: "IVP", name: "Volumetric infusion pump VP-200", manufacturer: "Brenmoor Medical",
    category: "infusion", intervalMonths: 12, em: [9, 5, 4], sizeCm: [15, 20, 25], count: 90,
    lifespanYears: 8, pricePounds: [1_800, 3_200], serialPrefix: "VP2-", firmware: ["2.1.0", "2.3.4", "3.0.1"],
    electrical: { class: "II", appliedPart: "CF" },
    performance: [
      { kind: "measurement", code: "FLOW", name: "Flow rate error at 100 mL/h", unit: "%", lower: -5, upper: 5, typical: [-2.5, 2.5], fail: 7.8, decimals: 1 },
      check("OCC", "Occlusion alarm"),
      check("AIL", "Air-in-line alarm"),
      check("BATT", "Battery runs pump for 30 minutes", false),
    ],
    placement: [["library", 30], ["ed-majors", 6], ["ed-resus", 4], ["amu-bay-a", 8], ["amu-bay-b", 8], ["icu-bay-1", 8], ["icu-bay-2", 8], ["icu-side-1", 2], ["icu-side-2", 2], ["icu-side-3", 2], ["surg-ward-a", 6], ["surg-ward-b", 6], ["recovery", 3], ["day-unit", 3]],
    owner: "LIB", failuresPerYear: 0.3,
    faults: ["Occlusion alarm sounding without cause", "Door latch broken", "Battery not holding charge", "Cracked casing after drop", "Air-in-line alarm fault"],
    parts: [{ partNumber: "VP2-BAT-01", description: "Battery pack" }, { partNumber: "VP2-DL-03", description: "Door latch assembly" }, { partNumber: "VP2-OS-02", description: "Occlusion sensor" }, { partNumber: "VP2-CL-01", description: "Pole clamp" }],
  },
  {
    slug: "syringe-driver", code: "SYR", name: "Syringe driver SD-50", manufacturer: "Brenmoor Medical",
    category: "infusion", intervalMonths: 12, em: [9, 5, 3], sizeCm: [30, 12, 12], count: 60,
    lifespanYears: 8, pricePounds: [1_200, 2_200], serialPrefix: "SD5-", firmware: ["1.8.2", "2.0.0"],
    electrical: { class: "II", appliedPart: "CF" },
    performance: [
      { kind: "measurement", code: "RATE", name: "Delivery rate error at 5 mL/h", unit: "%", lower: -2, upper: 2, typical: [-1.2, 1.2], fail: 3.6, decimals: 1 },
      check("OCC", "Occlusion alarm"),
      check("SIZE", "Syringe size detection"),
      check("EOI", "End-of-infusion alarm"),
    ],
    placement: [["library", 20], ["icu-bay-1", 8], ["icu-bay-2", 8], ["icu-side-1", 1], ["icu-side-2", 1], ["icu-side-3", 1], ["amu-bay-a", 4], ["amu-bay-b", 4], ["surg-ward-a", 4], ["surg-ward-b", 4], ["recovery", 3], ["ed-resus", 2]],
    owner: "LIB", failuresPerYear: 0.2,
    faults: ["Plunger clamp not detecting syringe", "Occlusion alarm fault", "Display fault", "Keypad not responding"],
    parts: [{ partNumber: "SD5-PC-01", description: "Plunger clamp assembly" }, { partNumber: "SD5-KP-02", description: "Keypad membrane" }, { partNumber: "SD5-BAT-01", description: "Battery pack" }],
  },
  {
    slug: "patient-monitor", code: "PMN", name: "Bedside patient monitor PM-12", manufacturer: "Tessaly Medtech",
    category: "monitoring", intervalMonths: 12, em: [7, 3, 3], sizeCm: [33, 18, 30], count: 60,
    lifespanYears: 8, pricePounds: [4_500, 9_000], serialPrefix: "PM1-", firmware: ["10.2.1", "11.0.0"],
    electrical: { class: "I", appliedPart: "CF" },
    performance: [
      NIBP,
      SPO2,
      { kind: "measurement", code: "HR", name: "ECG heart rate with 80 bpm simulator", unit: "bpm", lower: 78, upper: 82, typical: [79, 81], fail: 86, decimals: 0 },
      check("ALM", "Alarm limits and audible alarm"),
    ],
    placement: [["icu-bay-1", 10], ["icu-bay-2", 10], ["icu-side-1", 2], ["icu-side-2", 2], ["icu-side-3", 2], ["ed-resus", 6], ["ed-majors", 6], ["theatre-1", 3], ["theatre-2", 3], ["recovery", 5], ["amu-bay-a", 3], ["amu-bay-b", 3], ["ed-cubicle-1", 1], ["ed-cubicle-2", 1], ["ed-cubicle-3", 1]],
    owner: "room", failuresPerYear: 0.15,
    faults: ["NIBP reading errors", "SpO2 probe not recognised", "Screen flickering", "Will not power on"],
    parts: [{ partNumber: "PM1-NP-01", description: "NIBP pump assembly" }, { partNumber: "PM1-SC-02", description: "SpO2 interface cable" }, { partNumber: "PM1-PSU-01", description: "Power supply unit" }],
  },
  {
    slug: "spot-check-vital-signs-monitor", code: "VSM", name: "Spot-check vital signs monitor VS-3", manufacturer: "Tessaly Medtech",
    category: "monitoring", intervalMonths: 12, em: [6, 3, 2], sizeCm: [22, 15, 25], count: 40,
    lifespanYears: 7, pricePounds: [1_200, 2_500], serialPrefix: "VS3-", firmware: ["3.4", "3.6"],
    electrical: { class: "II", appliedPart: "BF" },
    performance: [
      NIBP,
      SPO2,
      { kind: "measurement", code: "TEMP", name: "Temperature probe at 37.0 °C", unit: "°C", lower: 36.8, upper: 37.2, typical: [36.9, 37.1], fail: 37.6, decimals: 1 },
      check("BATT", "Battery charge indicator", false),
    ],
    placement: [["amu-bay-a", 5], ["amu-bay-b", 5], ["surg-ward-a", 5], ["surg-ward-b", 5], ["ed-majors", 4], ["ed-triage", 3], ["opd-clinic-1", 2], ["opd-clinic-2", 2], ["opd-clinic-3", 2], ["opd-clinic-4", 2], ["day-unit", 3], ["discharge-lounge", 2]],
    owner: "room", failuresPerYear: 0.2,
    faults: ["Temperature probe reading high", "NIBP cuff leak", "Stand castor broken", "Battery not charging"],
    parts: [{ partNumber: "VS3-TP-01", description: "Temperature probe" }, { partNumber: "VS3-HS-02", description: "NIBP hose" }, { partNumber: "VS3-CS-01", description: "Stand castor" }],
  },
  {
    slug: "ecg-machine", code: "ECG", name: "12-lead ECG recorder EC-12", manufacturer: "Orrin Lifecare",
    category: "diagnostic", intervalMonths: 12, em: [6, 3, 3], sizeCm: [35, 30, 12], count: 15,
    lifespanYears: 8, pricePounds: [3_500, 7_000], serialPrefix: "EC1-", firmware: ["2.2", "2.4"],
    electrical: { class: "I", appliedPart: "CF" },
    performance: [
      { kind: "measurement", code: "HR", name: "Heart rate with 60 bpm simulator", unit: "bpm", lower: 59, upper: 61, typical: [59, 61], fail: 64, decimals: 0 },
      check("LEAD", "Lead-off detection"),
      check("PRINT", "Print quality at 25 mm/s"),
    ],
    placement: [["ed-majors", 3], ["ed-resus", 1], ["amu-bay-a", 2], ["amu-bay-b", 1], ["cardiology", 4], ["icu-bay-1", 1], ["surg-ward-a", 1], ["opd-clinic-1", 1], ["day-unit", 1]],
    owner: "room", failuresPerYear: 0.15,
    faults: ["Patient cable fault", "Printer jams", "Noisy trace on all leads"],
    parts: [{ partNumber: "EC1-PC-10", description: "10-lead patient cable" }, { partNumber: "EC1-PH-01", description: "Print head" }],
  },
  {
    slug: "suction-unit", code: "SUC", name: "Portable suction unit SU-20", manufacturer: "Orrin Lifecare",
    category: "therapy", intervalMonths: 12, em: [8, 4, 3], sizeCm: [30, 25, 35], count: 25,
    lifespanYears: 10, pricePounds: [600, 1_500], serialPrefix: "SU2-",
    electrical: { class: "I", appliedPart: null },
    performance: [
      { kind: "measurement", code: "VAC", name: "Maximum vacuum", unit: "kPa", lower: 60, typical: [72, 88], fail: 48, decimals: 0 },
      check("REG", "Vacuum regulator and gauge"),
      check("OVF", "Overflow protection"),
    ],
    placement: [["ed-resus", 3], ["ed-majors", 2], ["icu-bay-1", 3], ["icu-bay-2", 3], ["icu-side-1", 1], ["icu-side-2", 1], ["icu-side-3", 1], ["theatre-1", 2], ["theatre-2", 2], ["recovery", 2], ["amu-bay-a", 1], ["amu-bay-b", 1], ["surg-ward-a", 1], ["surg-ward-b", 1], ["library", 2]],
    owner: "room", failuresPerYear: 0.15,
    faults: ["Weak suction", "Gauge not reading", "Motor noisy"],
    parts: [{ partNumber: "SU2-PM-01", description: "Pump diaphragm kit" }, { partNumber: "SU2-GA-01", description: "Vacuum gauge" }, { partNumber: "SU2-FL-05", description: "Bacterial filter" }],
  },
  {
    slug: "patient-hoist", code: "HST", name: "Mobile patient hoist PH-180", manufacturer: "Calder Care Systems",
    category: "patient_handling", intervalMonths: 6, intervalReason: "LOLER: 6-monthly thorough examination of lifting equipment for people",
    em: [2, 4, 4], sizeCm: [70, 120, 190], count: 12, lifespanYears: 10, pricePounds: [2_000, 4_000], serialPrefix: "PH1-",
    electrical: { class: "II", appliedPart: null },
    performance: [
      check("SWL", "Load test at safe working load"),
      check("SLING", "Sling and spreader bar inspection"),
      check("EMLW", "Emergency lowering"),
      check("BATT", "Battery and charger"),
    ],
    placement: [["amu-bay-a", 2], ["amu-bay-b", 2], ["surg-ward-a", 2], ["surg-ward-b", 2], ["icu-bay-1", 1], ["icu-bay-2", 1], ["day-unit", 1], ["ed-majors", 1]],
    owner: "room", failuresPerYear: 0.25,
    faults: ["Actuator will not lift", "Hand control damaged", "Emergency lowering stiff"],
    parts: [{ partNumber: "PH1-ACT-01", description: "Lifting actuator" }, { partNumber: "PH1-HC-02", description: "Hand control" }, { partNumber: "PH1-BAT-01", description: "Battery pack" }],
  },
  {
    slug: "hospital-bed", code: "BED", name: "Electric hospital bed HB-90", manufacturer: "Calder Care Systems",
    category: "patient_handling", intervalMonths: 12, em: [2, 4, 3], sizeCm: [100, 220, 60], count: 60,
    lifespanYears: 12, pricePounds: [2_500, 5_500], serialPrefix: "HB9-",
    electrical: { class: "I", appliedPart: null },
    performance: [
      check("FUNC", "Height, backrest and tilt functions"),
      check("CPR", "CPR quick release"),
      check("BRK", "Brakes and castors"),
      check("RAIL", "Side rails lock"),
      check("HAND", "Hand control and lockout"),
    ],
    placement: [["amu-bay-a", 8], ["amu-bay-b", 8], ["amu-side-1", 2], ["amu-side-2", 2], ["surg-ward-a", 8], ["surg-ward-b", 8], ["surg-side-1", 2], ["surg-side-2", 2], ["icu-bay-1", 5], ["icu-bay-2", 5], ["icu-side-1", 1], ["icu-side-2", 1], ["icu-side-3", 1], ["ed-majors", 4]],
    owner: "room", failuresPerYear: 0.2,
    faults: ["Hand control not working", "Bed will not lower", "Castor brake failed", "Side rail latch broken"],
    parts: [{ partNumber: "HB9-HC-01", description: "Hand control" }, { partNumber: "HB9-ACT-02", description: "Height actuator" }, { partNumber: "HB9-CS-04", description: "Braked castor" }],
  },
  {
    slug: "electrical-safety-analyser", code: "ESA", name: "Electrical safety analyser SA-62", manufacturer: "Vantor Test Instruments",
    category: "test_equipment", intervalMonths: 12, intervalReason: "Annual calibration", em: [2, 2, 2], sizeCm: [30, 25, 12], count: 3,
    lifespanYears: 10, pricePounds: [4_000, 6_000], serialPrefix: "SA6-",
    electrical: null,
    performance: [check("CAL", "Calibration certificate in date"), check("SELF", "Self-test passes")],
    placement: [["ebme-workshop", 1]],
    owner: "EBME", failuresPerYear: 0, faults: [], parts: [], isTestEquipment: true,
  },
];

export const PART_SUPPLIERS = ["Northbrook Medical Spares Ltd", "Generic Clinical Parts Ltd", "Manufacturer service centre"];

/** Well-known real brands that must never appear in seed data (checked by tests). */
export const REAL_BRAND_DENYLIST = [
  "baxter", "becton", "philips", "ge healthcare", "medtronic", "draeger", "dräger", "zoll", "arjo", "stryker",
  "mindray", "b. braun", "fresenius", "hamilton medical", "welch allyn", "hill-rom", "hillrom", "smiths medical",
  "nihon kohden", "masimo", "fluke", "rigel", "resmed", "invacare", "getinge", "maquet", "laerdal", "alaris",
  "carefusion", "lifepak", "physio-control", "nellcor", "covidien", "siemens", "spacelabs", "schiller", "corpuls", "linet",
];
