export const SITE = 'https://ley81-suite.com';
// Contact and demo-request address (decided by Marc 2026-10-11). The mailbox/forwarding must exist before launch.
export const CONTACT_EMAIL = 'support@ley81-suite.com';
export const langs = ['es', 'en'] as const;
export type Lang = (typeof langs)[number];
export const defaultLang: Lang = 'es';
export const getStaticPaths = () => langs.map((lang) => ({ params: { lang } }));
