import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };
function Icon({ children, size = 20, ...props }: IconProps) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{children}</svg>; }
export const FloorIcon = (props: IconProps) => <Icon {...props}><path d="M4 20V9l8-5 8 5v11" /><path d="M9 20v-6h6v6M4 10h16" /></Icon>;
export const OrdersIcon = (props: IconProps) => <Icon {...props}><path d="M7 3h10l3 3v15H4V6l3-3Z" /><path d="M8 10h8M8 14h8M8 18h5" /></Icon>;
export const MenuIcon = (props: IconProps) => <Icon {...props}><circle cx="12" cy="12" r="8" /><path d="M8 9h8M8 12h8M8 15h5" /></Icon>;
export const ShiftIcon = (props: IconProps) => <Icon {...props}><path d="M12 3v9l5 3" /><circle cx="12" cy="12" r="8" /></Icon>;
export const BellIcon = (props: IconProps) => <Icon {...props}><path d="M18 10a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 22h4" /></Icon>;
export const SearchIcon = (props: IconProps) => <Icon {...props}><circle cx="10.8" cy="10.8" r="5.8" /><path d="m16 16 4 4" /></Icon>;
export const PlusIcon = (props: IconProps) => <Icon {...props}><path d="M12 5v14M5 12h14" /></Icon>;
export const ArrowRightIcon = (props: IconProps) => <Icon {...props}><path d="M5 12h14M13 6l6 6-6 6" /></Icon>;
export const ArrowLeftIcon = (props: IconProps) => <Icon {...props}><path d="M19 12H5m6-6-6 6 6 6" /></Icon>;
export const CloseIcon = (props: IconProps) => <Icon {...props}><path d="m6 6 12 12M18 6 6 18" /></Icon>;
export const MinusIcon = (props: IconProps) => <Icon {...props}><path d="M5 12h14" /></Icon>;
export const BackspaceIcon = (props: IconProps) => <Icon {...props}><path d="M9 6h9a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H9l-5-6 5-6Z" /><path d="m12 10 4 4m0-4-4 4" /></Icon>;
export const CheckIcon = (props: IconProps) => <Icon {...props}><path d="m5 12 4 4L19 6" /></Icon>;
export const AlertIcon = (props: IconProps) => <Icon {...props}><path d="M12 8v5M12 17h.01" /><path d="M10.1 4.4 3.4 16a2 2 0 0 0 1.7 3h13.8a2 2 0 0 0 1.7-3L13.9 4.4a2.2 2.2 0 0 0-3.8 0Z" /></Icon>;
