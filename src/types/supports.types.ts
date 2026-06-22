export type UnitSystem = 'cm' | 'mm' | 'px';

export type VersoMode = 'none' | 'logo' | 'mirror';

export type QrStyle = 'classic' | 'branded' | 'inverted' | 'dark';

export interface LogoConfig {
  visible: boolean;
  x: number;
  y: number;
  width: number;
}

export interface TextConfig {
  visible: boolean;
  x: number;
  y: number;
  fontSize: number;
  text: string;
}

export interface QrConfig {
  x: number;
  y: number;
  width: number;
  style: QrStyle;
  menuUrl: string;
}

export interface ChevaletConfig {
  unit: UnitSystem;
  background: string;
  accentColor: string;
  logo: LogoConfig;
  name: TextConfig;
  tagline: TextConfig;
  qrCode: QrConfig;
  verso: VersoMode;
}

export interface TenantForEditor {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  logoUrl: string | null;
  primaryColor: string;
  secondaryColor: string;
  menuUrl: string;
}
