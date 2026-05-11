"use client"

import {
  LineChart,
  Line,
  ResponsiveContainer,
  Tooltip,
} from "recharts"

type DataPoint = { v: number }

interface Props {
  data: DataPoint[]
  color?: string
  height?: number
}

/**
 * Minimal sparkline — no axes, no grid, just the line.
 * Pass in data as [{v: number}, ...] where v is the numeric value.
 */
export function SparkLine({ data, color = "#d4177a", height = 36 }: Props) {
  if (!data || data.length < 2) {
    return <div style={{ height }} className="flex items-center justify-center text-[10px] text-muted-foreground">—</div>
  }

  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
          <Line
            type="monotone"
            dataKey="v"
            stroke={color}
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={false}
          />
          <Tooltip
            contentStyle={{ fontSize: 11, padding: "2px 6px", border: "1px solid #e5e7eb" }}
            formatter={(v) => [typeof v === "number" ? v.toFixed(2) + "×" : v, "GMROI"]}
            labelFormatter={() => ""}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

/**
 * Trend sparkline using a simple SVG path — no deps, works with just
 * a trend direction ("up" | "flat" | "down").  Used in category cards.
 */
export function TrendSparkSvg({
  trend,
  width = 48,
  height = 24,
}: {
  trend: "up" | "flat" | "down"
  width?: number
  height?: number
}) {
  const color =
    trend === "up"   ? "#10b981" :
    trend === "down" ? "#f43f5e" :
    "#f59e0b"

  // Bezier path for a smooth line
  const path =
    trend === "up"
      ? `M4,${height - 4} C${width * 0.3},${height * 0.6} ${width * 0.6},${height * 0.3} ${width - 4},4`
      : trend === "down"
      ? `M4,4 C${width * 0.3},${height * 0.3} ${width * 0.6},${height * 0.6} ${width - 4},${height - 4}`
      : `M4,${height / 2} Q${width / 2},${height / 2 - 3} ${width - 4},${height / 2}`

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      fill="none"
      className="shrink-0"
    >
      {/* subtle fill area */}
      <path
        d={`${path} L${width - 4},${height - 2} L4,${height - 2} Z`}
        fill={color}
        opacity={0.08}
      />
      <path d={path} stroke={color} strokeWidth={1.5} strokeLinecap="round" />
      {/* dot at end */}
      <circle
        cx={width - 4}
        cy={trend === "up" ? 4 : trend === "down" ? height - 4 : height / 2}
        r={2}
        fill={color}
      />
    </svg>
  )
}
