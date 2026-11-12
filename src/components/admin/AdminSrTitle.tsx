/**
 * Titre principal (h1) visuellement masque, pour les pages admin dont le
 * contenu n'en porte pas (la barre laterale dit deja ou l'on est). Une page
 * sans h1 est illisible pour un lecteur d'ecran.
 */
export default function AdminSrTitle({ label }: { label: string }) {
  return <h1 className="sr-only">{label}</h1>;
}
