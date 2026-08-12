import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function IconBase({ size = 22, children, ...props }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      {children}
    </svg>
  );
}

export function ShieldCheckIcon(props: IconProps) {
  return <IconBase {...props}><path d="M12 3 5 6v5c0 4.6 2.8 8.2 7 10 4.2-1.8 7-5.4 7-10V6l-7-3Z"/><path d="m9 12 2 2 4-5"/></IconBase>;
}
export function SlidersIcon(props: IconProps) {
  return <IconBase {...props}><path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/></IconBase>;
}
export function XIcon(props: IconProps) {
  return <IconBase {...props}><path d="m6 6 12 12M18 6 6 18"/></IconBase>;
}
export function HeartIcon(props: IconProps) {
  return <IconBase {...props}><path d="M20.8 4.6a5.4 5.4 0 0 0-7.6 0L12 5.8l-1.2-1.2a5.4 5.4 0 1 0-7.6 7.6L12 21l8.8-8.8a5.4 5.4 0 0 0 0-7.6Z"/></IconBase>;
}
export function InfoIcon(props: IconProps) {
  return <IconBase {...props}><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></IconBase>;
}
export function CompassIcon(props: IconProps) {
  return <IconBase {...props}><circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5 5-2Z"/></IconBase>;
}
export function ConnectionIcon(props: IconProps) {
  return <IconBase {...props}><path d="M8 12a4 4 0 1 1 4-4"/><path d="M16 12a4 4 0 1 0-4-4"/><path d="M4 21v-1a6 6 0 0 1 8-5.7M20 21v-1a6 6 0 0 0-8-5.7"/></IconBase>;
}
export function UserIcon(props: IconProps) {
  return <IconBase {...props}><circle cx="12" cy="8" r="4"/><path d="M4.5 21a7.5 7.5 0 0 1 15 0"/></IconBase>;
}
export function ChevronRightIcon(props: IconProps) {
  return <IconBase {...props}><path d="m9 18 6-6-6-6"/></IconBase>;
}
export function LockIcon(props: IconProps) {
  return <IconBase {...props}><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></IconBase>;
}
export function ClockIcon(props: IconProps) {
  return <IconBase {...props}><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></IconBase>;
}
export function PauseIcon(props: IconProps) {
  return <IconBase {...props}><path d="M8 5v14M16 5v14"/></IconBase>;
}
export function SparkIcon(props: IconProps) {
  return <IconBase {...props}><path d="m12 3 1.4 4.6L18 9l-4.6 1.4L12 15l-1.4-4.6L6 9l4.6-1.4L12 3Z"/><path d="m19 15 .7 2.3L22 18l-2.3.7L19 21l-.7-2.3L16 18l2.3-.7L19 15Z"/></IconBase>;
}
export function ArrowLeftIcon(props: IconProps) {
  return <IconBase {...props}><path d="m15 18-6-6 6-6"/></IconBase>;
}
export function CheckIcon(props: IconProps) {
  return <IconBase {...props}><path d="m5 12 4 4L19 6"/></IconBase>;
}
export function CameraIcon(props: IconProps) {
  return <IconBase {...props}><path d="M14.5 5 13 3h-2L9.5 5H6a3 3 0 0 0-3 3v9a3 3 0 0 0 3 3h12a3 3 0 0 0 3-3V8a3 3 0 0 0-3-3h-3.5Z"/><circle cx="12" cy="13" r="4"/></IconBase>;
}
export function EyeIcon(props: IconProps) {
  return <IconBase {...props}><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.5"/></IconBase>;
}
export function ChurchIcon(props: IconProps) {
  return <IconBase {...props}><path d="M12 2v5M9.5 4.5h5M7 11l5-4 5 4v10H7V11Z"/><path d="M4 14h3M17 14h3M10 21v-5h4v5"/></IconBase>;
}
export function BellIcon(props: IconProps) {
  return <IconBase {...props}><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></IconBase>;
}
