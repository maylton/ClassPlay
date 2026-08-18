type AppIconProps = {
  name: string;
  className?: string;
  label?: string;
};

export function AppIcon({ name, className = "", label }: AppIconProps) {
  const classes = ["bi", `bi-${name}`, className].filter(Boolean).join(" ");

  if (label) {
    return <i className={classes} role="img" aria-label={label} />;
  }

  return <i className={classes} aria-hidden="true" />;
}
