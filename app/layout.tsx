import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DecisionLayer",
  description:
    "DecisionLayer is a lightweight product decision engine that helps teams evaluate ideas using impact, effort, confidence, and structured analysis.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
