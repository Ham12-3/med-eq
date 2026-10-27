import { RoleHome } from "@/components/role-home";

export default function Page() {
  return (
    <RoleHome
      action="workorder.viewQueue"
      title="My jobs"
      milestone="M3"
      description="Your job queue of PPM, repair, acceptance and recall jobs, sorted by priority then due date."
    />
  );
}
