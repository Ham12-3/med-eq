import { redirect } from "next/navigation";

// The proxy sends "/" to the signed-in user's home, or to /login. This is the fallback.
export default function Home() {
  redirect("/login");
}
