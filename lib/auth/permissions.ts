// Who may do what. PLAN.md section 1 (roles) and section 5 (route map).
// Pure: no framework or database imports, so the proxy, pages, server actions
// and tests all share one definition.

export const ROLES = ["technician", "manager", "ward", "library", "admin"] as const;
export type Role = (typeof ROLES)[number];

export const ACTIONS = [
  "asset.view", // a device's own page (ward staff get the read-only summary)
  "asset.viewRegister", // the full asset register table
  "asset.register", // add a device and open its acceptance job
  "location.record", // scan a device into a room
  "device.find", // nearest available device
  "device.checkSafe", // scan a device to see whether it is safe to use
  "device.markInUse", // tap "In use" or "Free" (PLAN.md Q4)
  "fault.report", // ward fault report, which creates a repair job
  "workorder.viewQueue", // see the job queue
  "workorder.work", // record inspection, parts and tests; close jobs
  "workorder.assign", // reassign jobs between technicians
  "library.checkInOut", // equipment library check-out and check-in
  "model.manage", // device models, test templates, EM scores
  "notice.manage", // safety notices and recalls
  "incident.manage", // MDSO incident log
  "report.view", // manager reports and dashboard
  "audit.export", // audit evidence export
  "user.manage", // users and roles
] as const;
export type Action = (typeof ACTIONS)[number];

const TECHNICIAN: Action[] = [
  "asset.view", "asset.viewRegister", "asset.register", "location.record", "device.find",
  "device.checkSafe", "device.markInUse", "fault.report", "workorder.viewQueue", "workorder.work",
];

const PERMISSIONS: Record<Role, ReadonlySet<Action>> = {
  technician: new Set(TECHNICIAN),
  // The manager can do everything a technician can, plus oversight.
  manager: new Set<Action>([
    ...TECHNICIAN, "workorder.assign", "model.manage", "notice.manage", "report.view",
  ]),
  ward: new Set<Action>([
    "asset.view", "location.record", "device.find", "device.checkSafe", "device.markInUse", "fault.report",
  ]),
  library: new Set<Action>([
    "asset.view", "location.record", "device.find", "device.checkSafe", "device.markInUse", "fault.report",
    "library.checkInOut",
  ]),
  // The MDSO / admin can see and do everything.
  admin: new Set<Action>(ACTIONS),
};

export type Subject = { role: Role; active: boolean };

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

/** The single permission check. Inactive users can do nothing. */
export function can(user: Subject | null | undefined, action: Action): boolean {
  return !!user && user.active && PERMISSIONS[user.role].has(action);
}

export const ROLE_HOME: Record<Role, string> = {
  technician: "/work",
  manager: "/dashboard",
  ward: "/ward",
  library: "/library",
  admin: "/notices",
};

export const ROLE_LABEL: Record<Role, string> = {
  technician: "Technician",
  manager: "Engineering manager",
  ward: "Ward staff",
  library: "Equipment library",
  admin: "MDSO / admin",
};

/**
 * Routes that need a permission, most specific first. A prefix also covers the pages below it,
 * unless marked exact. Pages re-check; this drives proxy redirects.
 */
const ROUTE_ACTIONS: [prefix: string, action: Action, exact?: "exact"][] = [
  ["/assets/new", "asset.register"],
  ["/assets", "asset.viewRegister", "exact"], // the register itself
  ["/assets", "asset.view"], // one device's page, which ward staff may see
  ["/find", "device.find"],
  ["/map", "asset.view"],
  ["/work", "workorder.viewQueue"],
  ["/dashboard", "report.view"],
  ["/reports", "report.view"],
  ["/ward", "fault.report"],
  ["/report-fault", "fault.report"],
  ["/scan", "location.record"],
  ["/library", "library.checkInOut"],
  ["/models", "model.manage"],
  ["/notices", "notice.manage"],
  ["/incidents", "incident.manage"],
  ["/admin/users", "user.manage"],
  ["/admin/audit", "audit.export"],
];

export function requiredAction(pathname: string): Action | null {
  for (const [prefix, action, exact] of ROUTE_ACTIONS) {
    if (pathname === prefix || (!exact && pathname.startsWith(`${prefix}/`))) return action;
  }
  return null;
}

/**
 * Where to send someone after sign-in: the page they asked for if it is a safe
 * local path they may open, otherwise their role's home.
 */
export function landingPath(role: Role, requested: string | null | undefined): string {
  const home = ROLE_HOME[role];
  if (!requested || !requested.startsWith("/") || requested.startsWith("//") || requested.includes("\\")) return home;
  if (requested === "/" || requested.startsWith("/login") || requested.startsWith("/api/")) return home;
  const action = requiredAction(requested.split(/[?#]/)[0]);
  return action && !can({ role, active: true }, action) ? home : requested;
}
