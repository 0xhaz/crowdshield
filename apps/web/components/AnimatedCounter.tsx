"use client";

import CountUp from "react-countup";

export function AnimatedCounter({
  value,
  prefix = "",
  decimals = 0,
}: {
  value: number;
  prefix?: string;
  decimals?: number;
}) {
  return <CountUp end={value} prefix={prefix} decimals={decimals} separator="," preserveValue />;
}
