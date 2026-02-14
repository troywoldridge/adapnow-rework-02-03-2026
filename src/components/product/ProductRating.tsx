import { FaRegStar, FaStar, FaStarHalfAlt } from "react-icons/fa";

type Props = {
  rating: number; // e.g. 4.7
  count?: number;
  className?: string;
};

function clamp(n: number, min: number, max: number) {
  const x = Number(n);
  if (!Number.isFinite(x)) return min;
  return Math.min(max, Math.max(min, x));
}

export default function ProductRating({ rating, count, className = "mb-2 flex items-center gap-1" }: Props) {
  const r = clamp(rating, 0, 5);

  const stars = Array.from({ length: 5 }, (_, i) => {
    const idx = i + 1;
    if (r >= idx) return <FaStar key={i} className="text-yellow-400" aria-hidden="true" />;
    if (r > i && r < idx) return <FaStarHalfAlt key={i} className="text-yellow-400" aria-hidden="true" />;
    return <FaRegStar key={i} className="text-yellow-400" aria-hidden="true" />;
  });

  return (
    <div className={className} aria-label={`Rating ${r.toFixed(1)} out of 5`}>
      <span className="sr-only">{`Rating ${r.toFixed(1)} out of 5`}</span>
      {stars}
      {typeof count === "number" ? (
        <span className="ml-1 text-xs text-gray-500">{`(${count.toLocaleString()} Reviews)`}</span>
      ) : null}
    </div>
  );
}
