import {
  CircleDot,
  Cog,
  Disc,
  Droplet,
  Filter,
  type LucideIcon,
  Search,
  Thermometer,
  Wind,
  Wrench,
  Zap,
} from 'lucide-react'

const ICONS: Record<string, LucideIcon> = {
  'Oil and filter change': Droplet,
  'Tire rotation': CircleDot,
  'Engine air filter': Filter,
  'Cabin air filter': Wind,
  'Brake fluid': Disc,
  'Engine coolant': Thermometer,
  'Transmission fluid': Cog,
  'Spark plugs': Zap,
  'Multi-point inspection': Search,
  'Drive belt inspection': Search,
  'Valve clearance inspection': Search,
  'Timing belt and water pump inspection': Search,
}

/** Line icon for a tracked service; a wrench for anything else. */
export function serviceIcon(serviceName: string | null): LucideIcon {
  return (serviceName && ICONS[serviceName]) || Wrench
}
