'use client';

import { useReducer, useCallback } from 'react';
import {
  QRDesignConfig,
  createDefaultQRDesignConfig,
  TEMPLATE_DEFAULTS,
  QRTemplateId,
} from '@/types/qr-design.types';

// --- Action Types --------------------------------------

type SetFieldAction = {
  type: 'SET_FIELD';
  key: keyof QRDesignConfig;
  value: QRDesignConfig[keyof QRDesignConfig];
};

type SetTemplateAction = {
  type: 'SET_TEMPLATE';
  templateId: QRTemplateId;
};

type HydrateAction = {
  type: 'HYDRATE';
  config: QRDesignConfig;
};

type QRDesignAction = SetFieldAction | SetTemplateAction | HydrateAction;

// --- Reducer -------------------------------------------

export function qrDesignReducer(state: QRDesignConfig, action: QRDesignAction): QRDesignConfig {
  switch (action.type) {
    case 'SET_FIELD':
      return {
        ...state,
        [action.key]: action.value,
      };

    case 'SET_TEMPLATE': {
      // The card physical size is owned by the print format (QRExportPanel) so
      // switching template layouts must NOT reset templateWidth/Height. Only the
      // QR size default follows the template.
      const defaults = TEMPLATE_DEFAULTS[action.templateId];
      return {
        ...state,
        templateId: action.templateId,
        qrSize: defaults.qrSize,
      };
    }

    case 'HYDRATE':
      return action.config;

    default:
      return state;
  }
}

// --- Hook ----------------------------------------------

export function useQRDesignConfig(primaryColor: string) {
  const [state, dispatch] = useReducer(qrDesignReducer, { primaryColor }, (init) =>
    createDefaultQRDesignConfig(init.primaryColor),
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

  const hydrate = useCallback((config: QRDesignConfig) => {
    dispatch({ type: 'HYDRATE', config });
  }, []);

  return { config: state, updateField, setTemplate, hydrate };
}
