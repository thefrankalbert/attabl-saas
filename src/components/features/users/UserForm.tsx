'use client';

import { Mail, Loader2, Send } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import PostesPicker from '@/components/features/users/PostesPicker';
import { useSegmentTerms } from '@/hooks/useSegmentTerms';
import type { StaffPoste } from '@/types/permission.types';

interface UserFormProps {
  // Invitation form
  inviteEmail: string;
  setInviteEmail: (email: string) => void;
  invitePostes: StaffPoste[];
  setInvitePostes: (postes: StaffPoste[]) => void;
  /** Postes que l'acteur peut donner (voir PostesPicker). */
  grantablePostes: readonly StaffPoste[];
  inviting: boolean;
  onSendInvitation: () => Promise<void>;

  onClose: () => void;
}

// --- Component ---------------------------------------------

export default function UserForm({
  inviteEmail,
  setInviteEmail,
  invitePostes,
  setInvitePostes,
  grantablePostes,
  inviting,
  onSendInvitation,
  onClose,
}: UserFormProps) {
  const t = useTranslations('users');
  const seg = useSegmentTerms();

  return (
    <div className="space-y-4">
      {/* Seul chemin pour faire entrer du personnel: l'invitation (le titulaire du compte choisit son mot de passe). */}
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="invite-email">{t('memberEmail')}</Label>
          <div className="relative">
            <Mail className="absolute left-3 top-3 h-4 w-4 text-app-text-muted" />
            <Input
              id="invite-email"
              className="pl-9"
              type="email"
              placeholder={seg.emailPlaceholder}
              autoComplete="off"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label id="invite-postes-label">{t('postesLabel')}</Label>
          <p className="text-xs text-app-text-secondary">{t('postesHint')}</p>
          <PostesPicker
            idPrefix="invite-poste"
            labelledBy="invite-postes-label"
            value={invitePostes}
            onChange={setInvitePostes}
            grantable={grantablePostes}
          />
        </div>

        <div className="pt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button
            variant="default"
            onClick={onSendInvitation}
            disabled={inviting || invitePostes.length === 0}
          >
            {inviting ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Send className="w-4 h-4 mr-2" />
            )}
            {t('sendInvitation')}
          </Button>
        </div>
      </div>
    </div>
  );
}
