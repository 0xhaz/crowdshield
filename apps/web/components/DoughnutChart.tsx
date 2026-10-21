"use client";

import { ArcElement, Chart as ChartJS, Legend, Tooltip } from "chart.js";
import { Doughnut } from "react-chartjs-2";

ChartJS.register(ArcElement, Tooltip, Legend);

export function DoughnutChart({
  labels,
  values,
  colors,
  label,
}: {
  labels: string[];
  values: number[];
  colors: string[];
  label: string;
}) {
  const empty = values.every((v) => v === 0);
  return (
    <Doughnut
      aria-label={label}
      role="img"
      data={{
        labels: empty ? ["None"] : labels,
        datasets: [
          {
            label,
            data: empty ? [1] : values,
            backgroundColor: empty ? ["#EAECF0"] : colors,
            borderWidth: 0,
          },
        ],
      }}
      options={{
        cutout: "60%",
        plugins: { legend: { display: false }, tooltip: { enabled: !empty } },
      }}
    />
  );
}
