import { RoleHome } from "@/components/role-home";

export default function Page() {
  return (
    <RoleHome
      action="notice.manage"
      title="Safety notices"
      milestone="M4"
      description="Log National Patient Safety Alerts, MHRA safety messages and Field Safety Notices, and track every matched device to closure."
    />
  );
}
