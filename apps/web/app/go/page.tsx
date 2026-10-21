import { redirect } from "next/navigation";
import { getMe, homeFor } from "@/lib/api";

/** "Open your dashboard" from the landing page: the right portal for the signed-in role. */
export default async function Go() {
  redirect(homeFor(await getMe()));
}
