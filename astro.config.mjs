import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://ley81-suite.com',
  trailingSlash: 'always',
  // Never inline CSS: lets the Content-Security-Policy forbid inline styles.
  build: { inlineStylesheets: 'never' },
  integrations: [
    sitemap({
      i18n: { defaultLocale: 'es', locales: { es: 'es', en: 'en' } },
    }),
  ],
});
