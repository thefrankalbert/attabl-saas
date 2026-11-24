'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { createClient } from '@/lib/supabase/client';
import { prepareLogoutInBrowser } from '@/lib/offline/browser-logout-cleanup';
import { logger } from '@/lib/logger';
import { SecurityRow, SecuritySection } from './SecuritySection';

/**
 * "Connexion": changer son mot de passe (lien par e-mail, la meme route que
 * "mot de passe oublie") et fermer sa session sur tous les appareils.
 */
export default function SecurityAccountSection() {
  const t = useTranslations('settings');
  const { toast } = useToast();
  const [sendingLink, setSendingLink] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const sendPasswordLink = async () => {
    setSendingLink(true);
    try {
      const { data } = await createClient().auth.getUser();
      const email = data.user?.email;
      if (!email) throw new Error('no email on session');
      const res = await fetch('/api/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (res.status === 429) {
        toast({ title: t('passwordLinkTooMany'), variant: 'destructive' });
        return;
      }
      if (!res.ok) throw new Error(`forgot-password ${res.status}`);
      toast({ title: t('passwordLinkSent', { email }) });
    } catch (err) {
      logger.error('Password change link failed', err);
      toast({ title: t('passwordLinkError'), variant: 'destructive' });
    } finally {
      setSendingLink(false);
    }
  };

  // Meme chemin que "Se deconnecter" du menu du compte: on vide d'abord la file
  // des commandes en attente. Si elle ne se vide pas, on ne deconnecte PAS (ces
  // commandes seraient perdues) et on dit pourquoi.
  const signOutEverywhere = async () => {
    setSigningOut(true);
    try {
      const { blocked } = await prepareLogoutInBrowser({ force: false });
      if (blocked) {
        setConfirmOpen(false);
        toast({ title: t('signOutBlocked'), variant: 'destructive' });
        return;
      }
      // /api/auth/signout appelle signOut() dont la portee par defaut est
      // "global": toutes les sessions du compte sont revoquees.
      await fetch('/api/auth/signout', { method: 'POST' });
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- rechargement complet voulu a la deconnexion, comme le menu du compte (2026-11-24)
      window.location.assign('/login');
    } catch (err) {
      logger.error('Sign out everywhere failed', err);
      toast({ title: t('signOutError'), variant: 'destructive' });
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <SecuritySection title={t('securityAccessTitle')} description={t('securityAccessDesc')}>
      <SecurityRow title={t('passwordRowTitle')} description={t('passwordRowDesc')}>
        <Button
          type="button"
          variant="outline"
          className="min-h-[44px]"
          onClick={sendPasswordLink}
          disabled={sendingLink}
        >
          {t('passwordSendLink')}
        </Button>
      </SecurityRow>
      <SecurityRow title={t('devicesRowTitle')} description={t('devicesRowDesc')}>
        <Button
          type="button"
          variant="outline"
          className="min-h-[44px]"
          onClick={() => setConfirmOpen(true)}
        >
          {t('signOutEverywhere')}
        </Button>
      </SecurityRow>

      <AlertDialog open={confirmOpen} onOpenChange={(open) => !signingOut && setConfirmOpen(open)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('signOutConfirmTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('signOutConfirmDesc')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={signingOut}>{t('signOutCancel')}</AlertDialogCancel>
            <AlertDialogAction
              disabled={signingOut}
              onClick={(e) => {
                e.preventDefault();
                void signOutEverywhere();
              }}
            >
              {t('signOutEverywhere')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SecuritySection>
  );
}
