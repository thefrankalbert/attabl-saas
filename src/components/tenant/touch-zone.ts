/**
 * Zones tactiles de la vitrine. La regle du depot (.claude/rules/03) demande
 * 44 px au doigt; plusieurs boutons de la maquette sont plus petits. On garde
 * leur dessin et on elargit la zone sensible par un pseudo-element transparent
 * (audit d'equipe du 2026-11-27, convive C19). Le chiffre = (44 - taille) / 2.
 * L'element doit etre positionne (`relative`, ou deja `absolute`).
 *
 * Classes ecrites EN ENTIER: Tailwind ne voit pas une classe construite.
 */
export const TOUCH_EXTEND_9 =
  "before:absolute before:-inset-[9px] before:rounded-full before:content-['']"; // 26 px
export const TOUCH_EXTEND_6 =
  "before:absolute before:-inset-[6px] before:rounded-full before:content-['']"; // 32 px
export const TOUCH_EXTEND_5 =
  "before:absolute before:-inset-[5px] before:rounded-full before:content-['']"; // 34 px
export const TOUCH_EXTEND_3 =
  "before:absolute before:-inset-[3px] before:rounded-full before:content-['']"; // 38 px
