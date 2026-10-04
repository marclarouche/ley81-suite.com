export const SITE = 'https://ley81-suite.com';
// TODO(Marc): confirm the real contact address before launch. Placeholder only.
export const CONTACT_EMAIL = 'hello@ley81-suite.com';
export const langs = ['es', 'en'] as const;
export type Lang = (typeof langs)[number];
export const defaultLang: Lang = 'es';
export const getStaticPaths = () => langs.map((lang) => ({ params: { lang } }));
