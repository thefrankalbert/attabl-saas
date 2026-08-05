'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { CreditCard, Settings, ChevronsUpDown, CircleUser, LifeBuoy, LogOut } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
import { prepareLogoutInBrowser } from '@/lib/offline/browser-logout-cleanup';
import type { SettingsTab } from './SettingsDialog';

interface ShellAccountMenuProps {
  basePath: string;
  tenantSlug: string;
  userName?: string;
  userEmail?: string;
  initials: string;
  planName: string;
  planRaw: string;
  collapsed: boolean;
  /** Opens the settings hub dialog on the given tab (Parametres + account menu) */
  onOpenSettings?: (tab: SettingsTab) => void;
}

export function ShellAccountMenu({
  basePath,
  tenantSlug,
  userName,
  userEmail,
  initials,
  planName,
  planRaw,
  collapsed,
  onOpenSettings,
}: ShellAccountMenuProps) {
  const t = useTranslations('sidebar');
  const { toast } = useToast();

  const [loggingOut, setLoggingOut] = useState(false);
  // Non nul = la file n'a pas pu se vider et on demande une confirmation.
  const [blockedBy, setBlockedBy] = useState<{ pending: number; lost: number } | null>(null);

  // OFF-03. On ne se deconnecte pas tant que des commandes encaissees n'ont pas
  // ete envoyees: la file survivrait a la session et serait rejouee plus tard
  // sous l'identite du serveur suivant. On draine d'abord si le reseau est la,
  // et on ne bloque que si la file reste pleine.
  //
  // On N'UTILISE PAS form.submit() apres l'attente: le formulaire vit dans le
  // portail Radix du menu, que le clic sur l'item DEMONTE. Apres l'await le
  // noeud n'est plus rattache au document, et la specification HTML interdit a
  // un form detache de naviguer - submit() ne fait alors rien du tout et
  // l'utilisateur reste connecte en croyant s'etre deconnecte. On envoie donc la
  // requete nous-memes et on navigue a la main, sans dependre d'un noeud DOM.
  const handleLogout = async (force = false) => {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      const { blocked, pending, lost } = await prepareLogoutInBrowser({ force });

      if (blocked) {
        // On NE deconnecte PAS tout de suite, mais on ne piege pas non plus:
        // l'operateur voit ce qui reste en attente et peut assumer la sortie.
        setBlockedBy({ pending, lost });
        return;
      }

      if (lost > 0) {
        // Des entrees ont ete definitivement refusees ou ont expire pendant le
        // drain. C'est la SEULE occasion de le dire: elles n'existent plus.
        toast({
          title: t('logoutBlocked'),
          description: t('logoutLostDesc', { count: lost }),
          variant: 'destructive',
        });
      }

      await fetch('/api/auth/signout', { method: 'POST' });
    } catch {
      // Le nettoyage local a echoue (IndexedDB indisponible, quota). On ne piege
      // PAS l'utilisateur sur une tablette partagee: la deconnexion prime.
      await fetch('/api/auth/signout', { method: 'POST' }).catch(() => {});
    } finally {
      setLoggingOut(false);
    }
    window.location.assign('/login');
  };

  return (
    <>
      <AlertDialog open={blockedBy !== null} onOpenChange={(open) => !open && setBlockedBy(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('logoutBlocked')}</AlertDialogTitle>
            {/* Le texte dit ce qui se passe vraiment: les commandes ne sont pas
                perdues, elles attendent le retour de CETTE personne sur CETTE
                tablette. Sans cette phrase, "se deconnecter quand meme" serait
                un choix a l'aveugle sur de l'argent deja encaisse. */}
            <AlertDialogDescription>
              {blockedBy && blockedBy.lost > 0
                ? t('logoutLostDesc', { count: blockedBy.lost })
                : t('logoutBlockedDesc', { count: blockedBy?.pending ?? 0 })}
            </AlertDialogDescription>
            <AlertDialogDescription>{t('logoutForceExplain')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={loggingOut}>{t('logoutStay')}</AlertDialogCancel>
            <AlertDialogAction
              disabled={loggingOut}
              onClick={() => {
                setBlockedBy(null);
                void handleLogout(true);
              }}
            >
              {t('logoutForce')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            title={collapsed ? userName || t('accountMenu') : undefined}
            className={cn(
              'flex h-12 w-full items-center gap-2 rounded-[0.625rem] text-[var(--sidebar-foreground)] hover:bg-[var(--sidebar-accent)]',
              collapsed ? 'justify-center px-0' : 'justify-start px-2',
            )}
          >
            <span className="grid size-8 shrink-0 place-items-center overflow-hidden rounded-[0.625rem] bg-[var(--secondary)] text-xs font-semibold text-[var(--secondary-foreground)]">
              {initials}
            </span>
            {!collapsed && (
              <>
                <span className="flex min-w-0 flex-1 flex-col text-left leading-tight">
                  <span className="truncate text-[13px] font-semibold">
                    {userName || t('accountMenu')}
                  </span>
                  <span className="truncate text-xs text-[var(--muted-foreground)]">
                    {t('planLabel', { plan: planName })}
                  </span>
                </span>
                <ChevronsUpDown className="size-3.5 shrink-0 text-[var(--muted-foreground)]" />
              </>
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          side={collapsed ? 'right' : 'top'}
          align={collapsed ? 'end' : 'start'}
          className="w-56"
        >
          <DropdownMenuLabel>
            <span className="flex flex-col">
              <span className="truncate text-[13px] font-semibold">
                {userName || t('accountMenu')}
              </span>
              <span className="truncate text-xs font-normal text-[var(--muted-foreground)]">
                {userEmail || `${tenantSlug}.attabl.com`}
              </span>
            </span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {onOpenSettings ? (
            <>
              <DropdownMenuItem onClick={() => onOpenSettings('compte')}>
                <CircleUser className="size-4" />
                {t('accountMenu')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onOpenSettings('etablissement')}>
                <Settings className="size-4" />
                {t('navSettings')}
              </DropdownMenuItem>
            </>
          ) : (
            <>
              <DropdownMenuItem asChild>
                <Link href={`${basePath}/settings`} prefetch={false}>
                  <CircleUser className="size-4" />
                  {t('accountMenu')}
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href={`${basePath}/settings`} prefetch={false}>
                  <Settings className="size-4" />
                  {t('navSettings')}
                </Link>
              </DropdownMenuItem>
            </>
          )}
          <DropdownMenuItem asChild>
            <Link href={`${basePath}/subscription`} prefetch={false}>
              <CreditCard className="size-4" />
              <span className="flex-1">{t('navSubscription')}</span>
              <span className="rounded bg-[var(--secondary)] px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-[var(--secondary-foreground)]">
                {planRaw}
              </span>
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href={`${basePath}/support`} prefetch={false}>
              <LifeBuoy className="size-4" />
              {t('navSupport')}
            </Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {/* onSelect preventDefault: garde le menu monte pendant l'attente du
            nettoyage, sinon Radix le demonte au clic et l'item disparait sous le
            doigt avant meme que le message de blocage puisse s'afficher. */}
          <DropdownMenuItem
            asChild
            className="text-[var(--destructive)]"
            onSelect={(e) => e.preventDefault()}
          >
            {/* La fleche est obligatoire: passer handleLogout directement lui
              donnerait l'evenement de clic comme argument `force` - un objet,
              donc toujours vrai - et chaque deconnexion serait forcee en
              silence, sans la moindre confirmation. */}
            <Button
              type="button"
              onClick={() => handleLogout()}
              disabled={loggingOut}
              variant="ghost"
              className="h-auto w-full justify-start gap-2 px-2.5 py-2 font-normal text-[var(--destructive)] hover:bg-[var(--accent)] hover:text-[var(--destructive)]"
            >
              <LogOut className="size-4" />
              {t('logout')}
            </Button>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
