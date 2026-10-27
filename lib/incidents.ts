// Incident vocabulary, shared by the server and the browser. No database imports here.

export const HARM_LEVELS = ["no_harm", "low", "moderate", "severe", "death"] as const;
export type HarmLevel = (typeof HARM_LEVELS)[number];
export const HARM_TEXT: Record<HarmLevel, string> = {
  no_harm: "No harm", low: "Low harm", moderate: "Moderate harm", severe: "Severe harm", death: "Death",
};

export const INCIDENT_STATUSES = ["open", "under_investigation", "closed"] as const;
export type IncidentStatus = (typeof INCIDENT_STATUSES)[number];
export const INCIDENT_STATUS_TEXT: Record<IncidentStatus, string> = {
  open: "Open", under_investigation: "Under investigation", closed: "Closed",
};

export type IncidentRow = {
  id: string;
  reference: string;
  occurredAt: string;
  description: string;
  harmLevel: HarmLevel;
  status: IncidentStatus;
  reportedToMhra: boolean;
  yellowCardRef: string | null;
  reportedToMhraOn: string | null;
  assetId: string | null;
  giai: string | null;
  modelName: string | null;
  roomName: string | null;
  reportedBy: string;
};
