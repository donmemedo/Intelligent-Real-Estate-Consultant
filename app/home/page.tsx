import { Suspense } from "react";
import { HomeWorkspace } from "@/components/home-workspace";
import "./home.css";

// Product behavior and state rules: docs/product/home.md
export default function HomePage() {
  return <Suspense fallback={<p role="status">Loading workspace…</p>}><HomeWorkspace /></Suspense>;
}
