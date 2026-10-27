# M6: QA as each role

Run on 27 Oct 2026. Each role's top 5 tasks from PLAN.md section 1 were walked in Chromium, signed in through the development picker, against a freshly seeded test database. Desktop roles used a 1366 × 900 window; ward staff used a 390 × 844 phone-sized one.

Rerun it with `pnpm qa:roles`. The script ([qa/roles.qa.ts](../qa/roles.qa.ts)) uses the end-to-end test server and database, so none of its writes reach development data. It saves a screenshot for every task in `docs/qa/screens/`, and records what it saw in `docs/qa/results/<role>.json`.

**Result: 23 of 25 tasks work.** The other two need pages that the route map lists but that haven't been built yet: `/assets/new` and `/admin/users`. During QA I also found and fixed two problems: the main menu wrapped onto two lines, and ward staff had no list of the devices on their ward.

## Technician

| Task | Result | Screen |
|---|---|---|
| 1. Work the job queue | Works. 14 jobs, ordered by priority then due date | [technician-1](qa/screens/technician-1.png) |
| 2. Scan a device to open its record or job | Works. A typed GIAI shows "Safe to use" | [technician-2](qa/screens/technician-2.png) |
| 3. Complete the PPM checklist | Works. WO-000790 started, inspection saved, 10 tests recorded | [technician-3](qa/screens/technician-3.png) |
| 4. Close the job and print the SERVICED label | Works. "Returned to use", and the label PDF downloads | [technician-4](qa/screens/technician-4.png) |
| 5. Accept a new device into service | **Missing.** `/assets/new` returns 404 | [technician-5](qa/screens/technician-5.png) |

## Engineering manager

| Task | Result | Screen |
|---|---|---|
| 1. See overdue PPM and compliance at a glance | Works. 91.8 % compliance, 32 overdue, each tile links to its list | [manager-1](qa/screens/manager-1.png) |
| 2. Review failed tests from the last 90 days | Works. 8 failed tests in the report | [manager-2](qa/screens/manager-2.png) |
| 3. Run a recall search and track a notice to closure | Works. Notice list; the admin run (task 2) covers logging a notice and matching devices | [manager-3](qa/screens/manager-3.png) |
| 4. Balance technician workload and reassign jobs | Works. The queue can be shown for any technician, and each job has "Assign to" | [manager-4](qa/screens/manager-4.png) |
| 5. Export reports and review EM risk scores | Works. Overdue PPM CSV downloads; models list with EM scores | [manager-5](qa/screens/manager-5.png) |

## Ward nurse (phone)

| Task | Result | Screen |
|---|---|---|
| 1. Report a fault in two taps | Works. Device, then "Alarm fault"; the device turns Do not use at once | [ward-1](qa/screens/ward-1.png) |
| 2. Find the nearest working device | Works. 8 ECG recorders, nearest first, from AMU Bay A | [ward-2](qa/screens/ward-2.png) |
| 3. Scan a device and check it is safe to use | Works. The device faulted in task 1 shows "Do not use this device" | [ward-3](qa/screens/ward-3.png) |
| 4. See which devices are on my ward | **Fixed during QA.** The ward home now lists 52 devices by room, each with its status | [ward-4](qa/screens/ward-4.png) |
| 5. Mark a device as in use or free | Works. "In use" on the device page, then "Free" is offered | [ward-5](qa/screens/ward-5.png) |

## Equipment library

| Task | Result | Screen |
|---|---|---|
| 1. Check a device out to a ward | Works. "Checked out to AMU Bay A." | [library-1](qa/screens/library-1.png) |
| 2. Check a device in, cleaned and charged | Works. "Checked in: ready." | [library-2](qa/screens/library-2.png) |
| 3. See ready stock by model | Works. Ready, needs prep, on loan and in workshop, by model | [library-3](qa/screens/library-3.png) |
| 4. Chase devices out and overdue for return | Works. 36 loans out longer than 14 days, oldest first | [library-4](qa/screens/library-4.png) |
| 5. Send a faulty return to the workshop | Works. "Faulty? Report it" opens the fault form for that device, which raises a repair | [library-5](qa/screens/library-5.png) |

## MDSO / admin

| Task | Result | Screen |
|---|---|---|
| 1. Log an incident and flag a Yellow Card report | Works. The incident is logged, and the Yellow Card reference and date are saved | [admin-1](qa/screens/admin-1.png) |
| 2. Log a safety notice and track matched devices | Works. FSN/QA/0001 matched 15 devices, each with a recall job | [admin-2](qa/screens/admin-2.png) |
| 3. Export audit evidence for a device | Works. 39 entries for the device; the CSV downloads | [admin-3](qa/screens/admin-3.png) |
| 4. Manage users and roles | **Missing.** `/admin/users` returns 404 | [admin-4](qa/screens/admin-4.png) |
| 5. Manage reference data: models, rooms, templates | **Partly.** Models can be edited and re-scored. There are no pages for rooms or test templates; those come from the seed | [admin-5](qa/screens/admin-5.png) |

## Findings

### Fixed during QA

1. **The main menu wrapped onto two lines** for the manager and admin, whose menus have 10 to 13 links. The header now has two rows at every width: the name and the "Sign out" button on the first, and the menu on its own row below.
2. **Ward staff could not see the devices on their ward.** The ward home page now lists every device last seen in the nurse's department's rooms. They are grouped by room in collapsible sections, each with its status badge and a link to the device page.

### Still open

| # | Finding | Role task | Size |
|---|---|---|---|
| 1 | `/assets/new` is not built. A new device can't be registered and its acceptance job opened from the app | Technician 5 | Medium: a form, a GIAI check, and an acceptance job from the model's template |
| 2 | `/admin/users` is not built. Users and roles can only change through the seed | Admin 4 | Medium: a list, plus role and active changes through `authorizedWrite`, audited |
| 3 | There are no pages for rooms or test templates | Admin 5 | Medium. Rooms also feed the 3D map and the GLN labels |
| 4 | Page widths vary. The dashboard, models page and audit log are wider than the header, so their left edges don't line up with it | All | Small |
| 5 | Some seeded library loans have been out for nearly two years (703 days). That's a quirk of the seed, but it makes the chase list long | Library 4 | Small: cap loan ages in the seed |
| 6 | Carried over from M3: no optional fault photo (needs file storage) and no way to cancel a job | Ward 1, technician | Medium |

The art track (the Blender building, device models, images and video) is not part of this QA. It needs Blender with its MCP server and a `GEMINI_API_KEY`.
