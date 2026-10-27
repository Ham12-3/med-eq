import { RoleHome } from "@/components/role-home";

export default function Page() {
  return (
    <RoleHome
      action="fault.report"
      title="Ward"
      milestone="M3"
      description="Report a fault in two taps, find the nearest working device, or scan a device to check it is safe to use."
    />
  );
}
