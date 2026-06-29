function isWeekend(day: number) {
  return day === 0 || day === 6;
}

function daysUntilNextWeekday(day: number) {
  if (day === 5) return 3;
  if (day === 6) return 2;
  return 1;
}

export function getNextPostingWindow(now = new Date()) {
  const target = new Date(now);
  const day = target.getDay();
  target.setHours(9, 30, 0, 0);

  if (isWeekend(day) || now.getTime() > target.getTime()) {
    target.setDate(now.getDate() + daysUntilNextWeekday(day));
    target.setHours(9, 30, 0, 0);
  }

  return target;
}

export function formatPostingWindow(windowStart = getNextPostingWindow()) {
  return windowStart.toLocaleString(undefined, {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit"
  });
}
