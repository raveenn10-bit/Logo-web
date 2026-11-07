import type { Metadata } from "next";
export const metadata: Metadata = { title: "Account & Payments", robots: { index: false, follow: false, noarchive: true } };
export default function PaymentsLayout({ children }: { children: React.ReactNode }) { return children; }
