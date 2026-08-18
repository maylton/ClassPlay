"use client";

import { useState } from "react";
import { useClassroomSettings } from "@/hooks/useClassroomSettings";

export function SettingsPanel({ compact = false }: { compact?: boolean }) {
  const { settings, setSettings } = useClassroomSettings();
  const [open, setOpen] = useState(false);

  const toggles: { key: keyof typeof settings; label: string; description: string }[] = [
    { key: "reducedMotion", label: "Reduced motion", description: "Minimise flips and transitions" },
    { key: "largeText", label: "Large text", description: "Increase classroom text size" },
    { key: "highContrast", label: "High contrast", description: "Stronger borders and contrast" },
    { key: "soundEnabled", label: "Sound", description: "Allow pronunciation and sound" },
    { key: "readAloud", label: "Read aloud", description: "Speak prompts when supported" },
    { key: "timerEnabled", label: "Timer", description: "Use timed live questions" },
    { key: "leaderboardEnabled", label: "Leaderboard", description: "Show competitive scoring" },
  ];

  return (
    <div className="settings-wrap">
      <button className={compact ? "icon-settings-button" : "button button-soft button-small"} onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-label="Classroom settings">
        ⚙ {compact ? "" : "Settings"}
      </button>
      {open && (
        <div className="settings-popover" role="dialog" aria-label="Classroom settings">
          <div className="settings-heading"><div><small>CLASSROOM</small><strong>Accessibility & play</strong></div><button onClick={() => setOpen(false)} aria-label="Close settings">×</button></div>
          <div className="settings-list">
            {toggles.map(({ key, label, description }) => (
              <label className="setting-row" key={key}>
                <span><b>{label}</b><small>{description}</small></span>
                <input type="checkbox" checked={Boolean(settings[key])} onChange={(event) => setSettings({ ...settings, [key]: event.target.checked })} />
              </label>
            ))}
            {settings.timerEnabled && (
              <label className="timer-setting"><span>Live question time</span><select value={settings.timerSeconds} onChange={(event) => setSettings({ ...settings, timerSeconds: Number(event.target.value) })}><option value={15}>15 seconds</option><option value={20}>20 seconds</option><option value={30}>30 seconds</option><option value={45}>45 seconds</option><option value={60}>60 seconds</option></select></label>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
