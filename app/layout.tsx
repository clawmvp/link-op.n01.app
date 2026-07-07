import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Chainlink Operator Revenue — link-op.n01.app",
  description:
    "Revenue per Chainlink node operator, mapped from on-chain EarmarkSet events of the payments contract 0x5680…9171d.",
  metadataBase: new URL("https://link-op.n01.app"),
  openGraph: {
    title: "Chainlink Operator Revenue",
    description: "Revenue per Chainlink node operator, from on-chain earmark events.",
    url: "https://link-op.n01.app",
    siteName: "link-op.n01.app",
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
