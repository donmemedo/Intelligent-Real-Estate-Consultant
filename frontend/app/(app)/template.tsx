"use client";

import { motion } from "motion/react";

// Each page arrives with a short rise; transforms end as `none`, so fixed overlays stay viewport-anchored.
export default function Template({ children }: { children: React.ReactNode }) {
  return <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>{children}</motion.div>;
}
