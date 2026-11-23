// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { adminStoragePrefix, clearAdminSessionStorage } from '../admin-session-storage';
import { clearComposeStorage, readOrderKey, writeOrderKey } from '../pos/compose-storage';

function goTo(path: string): void {
  window.history.pushState({}, '', path);
}

afterEach(() => {
  sessionStorage.clear();
  goTo('/');
});

describe('stockage d onglet de l administration', () => {
  it('la cle porte le restaurant sur le domaine principal', () => {
    goTo('/sites/resto-a/admin/pos');
    expect(adminStoragePrefix()).toBe('attabl:admin:resto-a:');
    goTo('/admin/pos');
    expect(adminStoragePrefix()).toBe('attabl:admin:');
  });

  it('la cle d idempotence du restaurant A n est pas relue dans le restaurant B', () => {
    goTo('/sites/resto-a/admin/pos');
    writeOrderKey('cle-de-a');
    expect(readOrderKey()).toBe('cle-de-a');

    goTo('/sites/resto-b/admin/pos');
    expect(readOrderKey()).toBeNull();

    // Vider la composition de B ne touche pas celle de A.
    clearComposeStorage();
    goTo('/sites/resto-a/admin/pos');
    expect(readOrderKey()).toBe('cle-de-a');
  });

  it('la deconnexion vide tous les restaurants et rien d autre', () => {
    sessionStorage.setItem('attabl:admin:resto-a:pos:cart', '[1]');
    sessionStorage.setItem('attabl:admin:resto-b:pos:cart', '[2]');
    sessionStorage.setItem('autre', 'garde');

    clearAdminSessionStorage();

    expect(sessionStorage.getItem('attabl:admin:resto-a:pos:cart')).toBeNull();
    expect(sessionStorage.getItem('attabl:admin:resto-b:pos:cart')).toBeNull();
    expect(sessionStorage.getItem('autre')).toBe('garde');
  });
});
