import type { Metadata } from "next";
export const metadata: Metadata = { title: "Logo Editor", robots: { index: false, follow: false, noarchive: true } };
export default function EditorLayout({ children }: { children: React.ReactNode }) { return children; }
