import { cache } from 'react';
import { getMessages } from 'next-intl/server';
import { STOREFRONT_CLIENT_NAMESPACES, pickMessages } from './client-messages';

/**
 * Messages of the convive menu, computed once per request: the layout and the
 * pages receive the SAME object, so React serializes it only once in the page.
 */
export const getStorefrontMessages = cache(async () =>
  pickMessages(await getMessages(), STOREFRONT_CLIENT_NAMESPACES),
);
