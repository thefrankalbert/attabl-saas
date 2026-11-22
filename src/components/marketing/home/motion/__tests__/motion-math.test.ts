import { describe, expect, it } from 'vitest';
import en from '@/messages/en-US.json';
import fr from '@/messages/fr-FR.json';
import {
  MOSAIC_TILES,
  NARROW,
  TRACK,
  TRAVEL,
  WIDE,
  fieldWordEntry,
  mediaFrame,
  tileCenters,
} from '../motion-math';

describe('scene de la page d accueil', () => {
  it.each([WIDE, NARROW])('pose 17 tuiles et laisse la case centrale au media', (layout) => {
    const centers = tileCenters(layout);
    expect(centers).toHaveLength(MOSAIC_TILES.length);
    expect(centers).not.toContainEqual({ x: 0.5, y: layout.y[2] });
  });

  const box = { width: 1440, height: 836, side: 125.4, endY: 622.82 };

  it('ne deplace rien en haut de page', () => {
    expect(mediaFrame({ ...box, progress: 0 })).toEqual({
      y: 0,
      scale: 1,
      insetX: 0,
      insetY: 0,
      radius: 0,
    });
  });

  it('finit en tuile carree, arrondie a 20 px, dans sa case', () => {
    const end = mediaFrame({ ...box, progress: 1 });
    expect((box.width - 2 * end.insetX) * end.scale).toBeCloseTo(box.side);
    expect((box.height - 2 * end.insetY) * end.scale).toBeCloseTo(box.side);
    expect(end.radius * end.scale).toBeCloseTo(20);
    expect(box.height / 2 + end.y).toBeCloseTo(box.endY);
  });

  it.each([
    ['fr-FR', fr.marketing.home.mosaic.title],
    ['en-US', en.marketing.home.mosaic.title],
  ])('finit la cascade du titre avant la sortie de la scene (%s)', (_locale, title) => {
    const qWhenSceneLeaves = (TRACK - 1) / TRAVEL;
    expect(fieldWordEntry(qWhenSceneLeaves, title.split(' ').length - 1)).toBe(1);
  });
});
