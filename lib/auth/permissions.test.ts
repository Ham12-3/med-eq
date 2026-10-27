import { describe, expect, it } from "vitest";
import { ACTIONS, can, isRole, landingPath, requiredAction, ROLE_HOME, ROLES, type Role } from "./permissions";

const as = (role: Role, active = true) => ({ role, active });

describe("can", () => {
  it("lets the admin do everything", () => {
    for (const action of ACTIONS) expect(can(as("admin"), action), action).toBe(true);
  });

  it("lets the manager do everything a technician can", () => {
    for (const action of ACTIONS) {
      if (can(as("technician"), action)) expect(can(as("manager"), action), action).toBe(true);
    }
  });

  it("keeps the asset register and job queue away from ward and library staff", () => {
    for (const role of ["ward", "library"] as const) {
      expect(can(as(role), "asset.viewRegister")).toBe(false);
      expect(can(as(role), "workorder.work")).toBe(false);
      expect(can(as(role), "notice.manage")).toBe(false);
    }
  });

  it("lets every role report a fault and check a device is safe", () => {
    for (const role of ROLES) {
      expect(can(as(role), "fault.report"), role).toBe(true);
      expect(can(as(role), "device.checkSafe"), role).toBe(true);
    }
  });

  it("gives library check-out to the library, not the wards", () => {
    expect(can(as("library"), "library.checkInOut")).toBe(true);
    expect(can(as("ward"), "library.checkInOut")).toBe(false);
  });

  it("gives user management and audit export to the admin only", () => {
    for (const role of ROLES.filter((r) => r !== "admin")) {
      expect(can(as(role), "user.manage"), role).toBe(false);
      expect(can(as(role), "audit.export"), role).toBe(false);
    }
  });

  it("refuses inactive and missing users", () => {
    expect(can(as("admin", false), "asset.view")).toBe(false);
    expect(can(null, "asset.view")).toBe(false);
    expect(can(undefined, "asset.view")).toBe(false);
  });
});

describe("routes", () => {
  it("lets every role open its own home screen", () => {
    for (const role of ROLES) {
      const action = requiredAction(ROLE_HOME[role]);
      expect(action, role).not.toBeNull();
      expect(can(as(role), action!), role).toBe(true);
    }
  });

  it("matches routes by whole path segment", () => {
    expect(requiredAction("/assets")).toBe("asset.viewRegister");
    expect(requiredAction("/assets/123")).toBe("asset.viewRegister");
    expect(requiredAction("/assets/new")).toBe("asset.register");
    expect(requiredAction("/workshop")).toBeNull();
    expect(requiredAction("/login")).toBeNull();
  });
});

describe("landingPath", () => {
  it("keeps a requested page the role may open, with its query", () => {
    expect(landingPath("technician", "/assets?status=overdue")).toBe("/assets?status=overdue");
  });

  it("sends a role home from a page it may not open", () => {
    expect(landingPath("ward", "/assets")).toBe("/ward");
    expect(landingPath("library", "/notices")).toBe("/library");
  });

  it("never redirects off-site", () => {
    for (const evil of ["https://evil.example", "//evil.example", "/\\evil.example", "javascript:alert(1)"]) {
      expect(landingPath("manager", evil), evil).toBe("/dashboard");
    }
  });

  it("goes home when nothing useful was requested", () => {
    expect(landingPath("admin", "")).toBe("/notices");
    expect(landingPath("admin", null)).toBe("/notices");
    expect(landingPath("admin", "/")).toBe("/notices");
    expect(landingPath("admin", "/login?callbackUrl=/x")).toBe("/notices");
  });
});

describe("isRole", () => {
  it("accepts only known roles", () => {
    expect(isRole("ward")).toBe(true);
    expect(isRole("superuser")).toBe(false);
    expect(isRole(undefined)).toBe(false);
  });
});
