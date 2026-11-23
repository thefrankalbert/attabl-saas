import { Fragment } from 'react';

/**
 * Titre decoupe en mots des le rendu serveur, avec de vraies espaces entre eux
 * pour que les lecteurs d'ecran lisent la phrase normalement.
 * masked : chaque mot monte sous son propre masque.
 */
export function AnimatedWords({ text, masked = false }: { text: string; masked?: boolean }) {
  return text
    .split(/ +/)
    .filter(Boolean)
    .map((word, i) => {
      const animated = (
        <span data-mot className="home-mot">
          {word}
        </span>
      );
      return (
        <Fragment key={`${i}-${word}`}>
          {i > 0 && ' '}
          {masked ? <span className="home-mot-masque">{animated}</span> : animated}
        </Fragment>
      );
    });
}
