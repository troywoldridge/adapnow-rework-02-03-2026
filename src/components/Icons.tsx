// src/components/Icons.tsx
//
// Central icon exports so the rest of the app can import stable names.
// Uses lucide-react components (SVG React components).

import type { LucideIcon, LucideProps } from "lucide-react";
import { PiggyBank, Award, Clock, Check } from "lucide-react";

export type IconProps = LucideProps;
export type IconComponent = LucideIcon;

// Re-export under the names your pages/components expect:
export const PiggyBankIcon: IconComponent = PiggyBank;
export const RibbonIcon: IconComponent = Award; // Award is a ribbon/trophy-style icon
export const ClockIcon: IconComponent = Clock;
export const CheckIcon: IconComponent = Check;
