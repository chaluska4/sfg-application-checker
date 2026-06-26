interface ProgressBarProps {
  score: number;
}

export function ProgressBar({ score }: ProgressBarProps) {
  const barColor =
    score >= 90 ? "bg-success" : score >= 70 ? "bg-gold" : score >= 50 ? "bg-warning" : "bg-red-accent";

  return (
    <div className="w-full">
      <div className="mb-2 flex items-end justify-between">
        <span className="text-sm font-medium text-gray-600">Completion</span>
        <span className="font-serif text-3xl font-bold text-navy">{score}%</span>
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-gray-200">
        <div
          className={`h-full rounded-full ${barColor} animate-progress transition-all`}
          style={{ width: `${score}%` }}
        />
      </div>
    </div>
  );
}
