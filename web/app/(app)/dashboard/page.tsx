import { redirect } from "next/navigation";

// The single-pool dashboard became the pool marketplace.
export default function Dashboard() {
  redirect("/markets");
}
