import { RoleHome } from "@/components/role-home";

export default function Page() {
  return (
    <RoleHome
      action="library.checkInOut"
      title="Equipment library"
      milestone="M3"
      description="Check devices out to wards and back in, and see what is clean, charged and ready."
    />
  );
}
