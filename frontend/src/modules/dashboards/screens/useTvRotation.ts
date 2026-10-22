import { useEffect, useState } from "react";

/** Rotation between `count` dashboards: current index, play/pause and seconds per dashboard. */
export function useTvRotation(count: number, startIndex: number) {
  const [index, setIndex] = useState(startIndex);
  const [running, setRunning] = useState(true);
  const [seconds, setSeconds] = useState(30);

  useEffect(() => setIndex(startIndex), [startIndex]);
  useEffect(() => {
    if (!running || count < 2) return;
    const id = setInterval(() => setIndex((i) => (i + 1) % count), seconds * 1000);
    return () => clearInterval(id);
  }, [running, seconds, count]);

  return { index, setIndex, running, setRunning, seconds, setSeconds };
}
