import type { Lang } from '../config';

export const ui = {
  es: {
    siteTitle: 'Ley81·Suite',
    tagline: 'Cumplimiento de IA y protección de datos, local y bilingüe.',
    nav: {
      product: 'Producto',
      consultants: 'Consultores',
      companies: 'Empresas',
      frameworks: 'Marcos normativos',
      samples: 'Informes de muestra',
      security: 'Seguridad y privacidad',
      demo: 'Solicitar demo',
    },
    footer: {
      legal: 'Legal',
      privacy: 'Privacidad',
      terms: 'Términos',
      gdpr: 'Protección de datos (RGPD)',
      accessibility: 'Accesibilidad',
      disclaimer:
        'Ley81·Suite apoya la documentación y la evaluación del cumplimiento. No sustituye el criterio de un profesional calificado ni garantiza el cumplimiento legal.',
      rights: 'Todos los derechos reservados.',
      skip: 'Saltar al contenido',
      switchLang: 'English',
    },
    cta: { demo: 'Solicitar una demo', samples: 'Ver informes de muestra', more: 'Más información' },
  },
  en: {
    siteTitle: 'Ley81·Suite',
    tagline: 'AI governance and data-protection compliance, local-first and bilingual.',
    nav: {
      product: 'Product',
      consultants: 'Consultants',
      companies: 'Companies',
      frameworks: 'Frameworks',
      samples: 'Sample reports',
      security: 'Security & privacy',
      demo: 'Request a demo',
    },
    footer: {
      legal: 'Legal',
      privacy: 'Privacy',
      terms: 'Terms',
      gdpr: 'Data protection (GDPR)',
      accessibility: 'Accessibility',
      disclaimer:
        'Ley81·Suite supports compliance documentation and assessment. It does not replace the judgment of a qualified professional or guarantee legal compliance.',
      rights: 'All rights reserved.',
      skip: 'Skip to content',
      switchLang: 'Español',
    },
    cta: { demo: 'Request a demo', samples: 'See sample reports', more: 'Learn more' },
  },
} satisfies Record<Lang, unknown>;

export const useUi = (lang: Lang) => ui[lang];
