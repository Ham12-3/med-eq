import { describe, expect, it } from "vitest";
import { initialsFor, userChangeBlocker, type UserState } from "./userAdmin";

const admin: UserState = { id: "a", role: "admin", active: true, departmentId: "d" };
const tech: UserState = { id: "t", role: "technician", active: true, departmentId: "d" };

describe("userChangeBlocker", () => {
  it("allows ordinary changes", () => {
    expect(userChangeBlocker({ actorId: "a", before: tech, after: { ...tech, role: "manager" }, otherActiveAdmins: 0 })).toBeNull();
    expect(userChangeBlocker({ actorId: "a", before: tech, after: { ...tech, active: false }, otherActiveAdmins: 0 })).toBeNull();
    expect(userChangeBlocker({ actorId: "a", before: null, after: { role: "library", active: true, departmentId: null }, otherActiveAdmins: 1 })).toBeNull();
  });

  it("needs a department for ward staff", () => {
    expect(userChangeBlocker({ actorId: "a", before: null, after: { role: "ward", active: true, departmentId: null }, otherActiveAdmins: 1 }))
      .toMatch(/department/);
    expect(userChangeBlocker({ actorId: "a", before: tech, after: { ...tech, role: "ward", departmentId: null }, otherActiveAdmins: 1 }))
      .toMatch(/department/);
  });

  it("stops an admin locking themselves out", () => {
    expect(userChangeBlocker({ actorId: "a", before: admin, after: { ...admin, active: false }, otherActiveAdmins: 3 })).toMatch(/yourself inactive/);
    expect(userChangeBlocker({ actorId: "a", before: admin, after: { ...admin, role: "manager" }, otherActiveAdmins: 3 })).toMatch(/own admin role/);
  });

  it("keeps at least one active admin", () => {
    const other: UserState = { ...admin, id: "b" };
    expect(userChangeBlocker({ actorId: "a", before: other, after: { ...other, active: false }, otherActiveAdmins: 0 })).toMatch(/at least one/);
    expect(userChangeBlocker({ actorId: "a", before: other, after: { ...other, role: "technician" }, otherActiveAdmins: 0 })).toMatch(/at least one/);
    expect(userChangeBlocker({ actorId: "a", before: other, after: { ...other, active: false }, otherActiveAdmins: 1 })).toBeNull();
  });
});

describe("initialsFor", () => {
  it("takes the first and last words", () => {
    expect(initialsFor("Ofelia Roberts")).toBe("OR");
    expect(initialsFor("  frank  yost-schinner ")).toBe("FY");
    expect(initialsFor("Mary Jane Watson")).toBe("MW");
    expect(initialsFor("Cher")).toBe("C");
  });
});
