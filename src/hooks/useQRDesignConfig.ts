'use client';

import { useReducer, useCallback } from 'react';
import {
  QRDesignConfig,
  createDefaultQRDesignConfig,
  TEMPLATE_DEFAULTS,
  QRTemplateId,
} from '@/types/qr-design.types';

// ─── Action Types ──────────────────────────────────────

type SetFieldAction = {
  type: 'SET_FIELD';
  key: keyof QRDesignConfig;
  value: QRDesignConfig[keyof QRDesignConfig];
};

type SetTemplateAction = {
  type: 'SET_TEMPLATE';
  templateId: QRTemplateId;
};

type ResetAction = {
  type: 'RESET';
  primaryColor: string;
  secondaryColor: string;
};

type QRDesignAction = SetFieldAction | SetTemplateAction | ResetAction;

// ─── Reducer ───────────────────────────────────────────

function qrDesignReducer(state: QRDesignConfig, action: QRDesignAction): QRDesignConfig {
  switch (action.type) {
    case 'SET_FIELD':
      return {
        ...state,
        [action.key]: action.value,
      };

    case 'SET_TEMPLATE': {
      const defaults = TEMPLATE_DEFAULTS[action.templateId];
      return {
        ...state,
        templateId: action.templateId,
        templateWidth: defaults.width,
        templateHeight: defaults.height,
        qrSize: defaults.qrSize,
      };
    }

    case 'RESET':
      return createDefaultQRDesignConfig(action.primaryColor, action.secondaryColor);

    default:
      return state;
  }
}

// ─── Hook ──────────────────────────────────────────────

export function useQRDesignConfig(primaryColor: string, secondaryColor: string) {
  const [state, dispatch] = useReducer(qrDesignReducer, { primaryColor, secondaryColor }, (init) =>
    createDefaultQRDesignConfig(init.primaryColor, init.secondaryColor),
  );

  const updateField = useCallback(
    <K extends keyof QRDesignConfig>(key: K, value: QRDesignConfig[K]) => {
      dispatch({ type: 'SET_FIELD', key, value });
    },
    [],
  );

  const setTemplate = useCallback((templateId: QRTemplateId) => {
    dispatch({ type: 'SET_TEMPLATE', templateId });
  }, []);

  const resetConfig = useCallback(() => {
    dispatch({ type: 'RESET', primaryColor, secondaryColor });
  }, [primaryColor, secondaryColor]);

  return { config: state, updateField, setTemplate, resetConfig };
}
