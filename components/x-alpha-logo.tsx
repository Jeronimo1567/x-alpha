// X Alpha mark, redrawn from the hand-made original as clean geometry:
// one stroke runs down the long diagonal and around the loop, a second forms the lower leg.
type Props = { className?: string; title?: string };

export function XAlphaLogo({ className, title }: Props) {
  return (
    <svg viewBox="0 0 90 60" fill="none" stroke="currentColor" strokeWidth="10" className={className}
      role={title ? "img" : undefined} aria-label={title} aria-hidden={title ? undefined : true}>
      <path d="M78.14 7.14 41.14 44.14A20 20 0 1 1 42.32 17.14" />
      <path d="M58.14 27.14 84.14 53.14" />
    </svg>
  );
}
