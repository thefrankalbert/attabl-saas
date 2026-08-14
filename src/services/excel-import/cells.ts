// --- Cell Parsing ---------------------------------------------
//
// Ce module contenait sa PROPRE copie de `parseNumericCell` et
// `parseBooleanCell`, quasi identique a celle de `@/lib/excel-parse`. Les deux
// portaient le meme defaut de separateur de milliers (`"1,500"` lu comme 1.5),
// et le corriger d'un seul cote aurait laisse l'import de carte casse pendant
// que les imports fiches techniques et fournisseurs etaient repares - sans que
// rien ne signale l'ecart.
//
// Une seule implementation, donc un seul endroit ou la lecture d'un fichier
// uploade peut se tromper. On re-exporte plutot que de dupliquer.
export { parseBooleanCell, parseNumericCell } from '@/lib/excel-parse';
