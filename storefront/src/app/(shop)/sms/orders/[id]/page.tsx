import { SiteHeader } from "@/components/site/site-header";
import { SiteFooter } from "@/components/site/site-footer";
import { SmsOrders } from "@/components/sms/sms-orders";
export default async function SmsOrderPage({ params }: { params: Promise<{ id: string }> }) { return <><SiteHeader active="sms" /><SmsOrders key={(await params).id} orderId={(await params).id} /><SiteFooter /></>; }
