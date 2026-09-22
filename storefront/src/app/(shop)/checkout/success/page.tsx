import { redirect } from "next/navigation";

export default function CheckoutSuccessPage() {
  // Payment status belongs to an authenticated order, never to a static success URL.
  redirect("/orders");
}
