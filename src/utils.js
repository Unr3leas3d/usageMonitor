export function parseJson(text, fallback = null) {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

export function parseElapsedToMs(value) {
  if (!value) {
    return 0;
  }

  let days = 0;
  let timePart = value;

  if (value.includes("-")) {
    const [dayPart, rest] = value.split("-", 2);
    days = Number.parseInt(dayPart, 10) || 0;
    timePart = rest;
  }

  const parts = timePart.split(":").map((part) => Number.parseInt(part, 10) || 0);
  let hours = 0;
  let minutes = 0;
  let seconds = 0;

  if (parts.length === 3) {
    [hours, minutes, seconds] = parts;
  } else if (parts.length === 2) {
    [minutes, seconds] = parts;
  } else if (parts.length === 1) {
    [seconds] = parts;
  }

  return (((days * 24 + hours) * 60 + minutes) * 60 + seconds) * 1000;
}

export function formatDuration(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (days > 0) {
    return `${days}d ${String(hours).padStart(2, "0")}h`;
  }

  if (hours > 0) {
    return `${hours}h ${String(minutes).padStart(2, "0")}m`;
  }

  return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
}

export function formatUsageWindowLabel(windowMinutes, fallback = "n/a") {
  if (!windowMinutes && windowMinutes !== 0) {
    return fallback;
  }

  if (windowMinutes === 300) {
    return "5h";
  }

  if (windowMinutes === 10080) {
    return "7d";
  }

  if (windowMinutes % 1440 === 0) {
    return `${windowMinutes / 1440}d`;
  }

  if (windowMinutes % 60 === 0) {
    return `${windowMinutes / 60}h`;
  }

  return `${windowMinutes}m`;
}

export function formatResetTimestamp(epochSeconds) {
  if (!epochSeconds) {
    return "n/a";
  }

  return new Date(epochSeconds * 1000).toLocaleString();
}

export function formatResetCountdown(resetsAt, now = Date.now()) {
  if (!resetsAt) {
    return null;
  }

  const ts = typeof resetsAt === "number"
    ? (resetsAt < 1e12 ? resetsAt * 1000 : resetsAt)
    : new Date(resetsAt).getTime();

  if (!Number.isFinite(ts) || now >= ts) {
    return null;
  }

  return `in ${formatDuration(ts - now)}`;
}

export function truncate(value, width) {
  if (value.length <= width) {
    return value;
  }

  if (width <= 1) {
    return value.slice(0, width);
  }

  return `${value.slice(0, width - 1)}…`;
}

export function pad(value, width, align = "left") {
  const text = truncate(String(value ?? ""), width);
  return align === "right" ? text.padStart(width, " ") : text.padEnd(width, " ");
}

export function toTitleCase(value) {
  return value
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function safeDate(value) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function sortByLatestTimestamp(items, selector) {
  return [...items].sort((left, right) => {
    const leftTs = selector(left) || 0;
    const rightTs = selector(right) || 0;
    return rightTs - leftTs;
  });
}

export function compareSemver(left, right) {
  const leftParts = String(left || "")
    .split(".")
    .map((part) => Number.parseInt(part, 10) || 0);
  const rightParts = String(right || "")
    .split(".")
    .map((part) => Number.parseInt(part, 10) || 0);
  const width = Math.max(leftParts.length, rightParts.length, 1);

  for (let index = 0; index < width; index += 1) {
    const delta = (leftParts[index] || 0) - (rightParts[index] || 0);
    if (delta !== 0) {
      return delta;
    }
  }

  return 0;
}
