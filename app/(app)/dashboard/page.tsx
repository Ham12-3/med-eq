import { RoleHome } from "@/components/role-home";

export default function Page() {
  return (
    <RoleHome
      action="report.view"
      title="Dashboard"
      milestone="M4"
      description="The six numbers that matter: PPM compliance, overdue PPM, devices not to use, failed tests, open safety notices and mean time to repair."
    />
  );
}
